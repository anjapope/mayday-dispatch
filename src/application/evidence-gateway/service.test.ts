import { describe, expect, it } from "vitest";
import { EvidenceGatewayService } from "@/application/evidence-gateway/service";
import type { RegisterEvidenceRequest } from "@/application/evidence-gateway/dto";
import type { GatewayActor } from "@/application/publication-gateway/authorization";
import { InMemoryEvidenceRegistry } from "@/evidence/registry";

const mayday3: GatewayActor = {
  subjectId: "mayday3-service",
  roles: ["external-application"],
  originatingApplication: "mayday3",
};
const context = { requestId: "evidence-request", correlationId: "evidence-correlation" };

function evidence(overrides: Record<string, unknown> = {}): RegisterEvidenceRequest {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Processed document",
    mediaType: "application/pdf",
    source: "Public authority",
    provenance: "Mayday3 collection",
    visibility: "citation-only",
    checksum: "a".repeat(64),
    checksumAlgorithm: "sha256" as const,
    status: "registered" as const,
    citation: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Processed document source",
      authors: ["Public authority"],
    },
    ...overrides,
  };
}

describe("EvidenceGatewayService", () => {
  it("registers idempotently with versioned Mayday3 provenance", async () => {
    const registry = new InMemoryEvidenceRegistry();
    const service = new EvidenceGatewayService({
      registry,
      now: () => new Date("2026-09-25T12:00:00.000Z"),
    });
    const created = await service.register(mayday3, evidence(), {
      ...context,
      idempotencyKey: "register-document",
    });
    expect(created).toMatchObject({ version: 1, checksumAlgorithm: "sha256" });
    const replay = await service.register(mayday3, evidence(), {
      ...context,
      idempotencyKey: "register-document",
    });
    expect(replay).toMatchObject({ id: created.id, version: 1 });
  });

  it("requires current version, preserves identity, and supports processing recovery", async () => {
    const registry = new InMemoryEvidenceRegistry();
    const service = new EvidenceGatewayService({ registry });
    const created = await service.register(mayday3, evidence(), context);
    const processing = await service.update(created.id, mayday3, {
      expectedVersion: 1,
      status: "processing",
    }, context);
    const failed = await service.update(created.id, mayday3, {
      expectedVersion: 2,
      status: "failed",
      processingError: "Internal OCR validation failed.",
    }, context);
    const recovered = await service.update(created.id, mayday3, {
      expectedVersion: 3,
      status: "ready",
      processingError: undefined,
    }, context);
    expect([processing.version, failed.version, recovered.version]).toEqual([2, 3, 4]);
    expect(recovered.id).toBe(created.id);
    await expect(service.update(created.id, mayday3, {
      expectedVersion: 1,
      status: "ready",
    }, context)).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("preserves derivative lineage and rejects visibility escalation", async () => {
    const registry = new InMemoryEvidenceRegistry();
    const service = new EvidenceGatewayService({ registry });
    const parent = await service.register(mayday3, evidence(), context);
    const child = await service.register(mayday3, evidence({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "OCR artifact",
      mediaType: "text/plain",
      visibility: "internal",
      citation: undefined,
      parentEvidenceId: parent.id,
      derivationType: "ocr-text",
    }), context);
    expect(child).toMatchObject({ parentEvidenceId: parent.id, derivationType: "ocr-text" });
    await expect(service.update(child.id, mayday3, {
      expectedVersion: 1,
      visibility: "public",
      publicUrl: "https://example.org/ocr",
    }, context)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.register(mayday3, evidence({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      parentEvidenceId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    }), context)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("limits Mayday3 discovery to checksum lookup and hides internal evidence from external consumers", async () => {
    const registry = new InMemoryEvidenceRegistry();
    const service = new EvidenceGatewayService({ registry });
    await service.register(mayday3, evidence(), context);
    await expect(service.search(mayday3, { limit: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.search(mayday3, { checksum: "a".repeat(64), limit: 10 }))
      .resolves.toMatchObject({ evidence: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }] });
    const researchStudio: GatewayActor = {
      subjectId: "research-studio", roles: ["external-application"], originatingApplication: "research-studio",
    };
    await expect(service.retrieveDetail(researchStudio, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
      .resolves.toMatchObject({ evidence: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, auditHistory: [] });
  });
});
