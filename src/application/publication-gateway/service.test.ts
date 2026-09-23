import { describe, expect, it } from "vitest";
import type { GatewayActor } from "@/application/publication-gateway/authorization";
import { PublicationGatewayService } from "@/application/publication-gateway/service";
import { InMemoryEvidenceRegistry, type RegisteredEvidence } from "@/evidence/registry";
import { InMemoryPublicationRepository } from "@/publications/repository";

const researchActor: GatewayActor = {
  subjectId: "research-studio-service",
  roles: ["external-application"],
  originatingApplication: "Research Studio",
};
const editorActor: GatewayActor = { subjectId: "editor-1", roles: ["editor"] };
const publisherActor: GatewayActor = { subjectId: "publisher-1", roles: ["publisher"] };

const publicSource = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Public source",
  authors: ["Mayday Research Desk"],
  url: "https://example.org/source",
};
const publicEvidence: RegisteredEvidence = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Research appendix",
  mediaType: "application/pdf",
  source: "Research Studio",
  provenance: "Mayday3 evidence registration",
  visibility: "public",
  checksum: "a".repeat(64),
  status: "ready",
  publicUrl: "https://example.org/evidence/appendix",
  registeredAt: "2026-09-22T19:30:10.431Z",
};
const privateEvidence: RegisteredEvidence = {
  ...publicEvidence,
  id: "33333333-3333-4333-8333-333333333333",
  title: "Private notes",
  visibility: "private",
  publicUrl: undefined,
};

function createHarness(idFactory?: () => string) {
  const repository = new InMemoryPublicationRepository();
  const evidenceRegistry = new InMemoryEvidenceRegistry([publicEvidence, privateEvidence]);
  const service = new PublicationGatewayService({
    repository,
    evidenceRegistry,
    idFactory,
    now: () => new Date("2026-09-22T19:30:10.431Z"),
  });
  return { repository, service };
}

function researchDraft(overrides: Record<string, unknown> = {}) {
  return {
    slug: "research-studio-heat-intake",
    type: "academic-research-article",
    lifecycleState: "published",
    title: "Research Studio Heat Intake",
    excerpt: "Research Studio draft intake should remain a draft.",
    body: ["Evidence synthesis is ready for editorial review."],
    readingTimeMinutes: 7,
    visibility: "internal",
    origin: {
      kind: "academic-publication",
      label: "Research Studio",
      url: "https://example.org/research/heat-intake",
      originatingApplication: "Research Studio",
      originatingProject: "Climate Desk",
      stableObjectId: "research:heat:2026-09",
    },
    createdBy: "Research Studio",
    evidenceIds: [publicEvidence.id],
    sources: [publicSource],
    ...overrides,
  };
}

const context = {
  requestId: "request-1",
  correlationId: "correlation-1",
};

describe("PublicationGatewayService Phase Three", () => {
  it("creates a forced draft with registered evidence and origin-link metadata", async () => {
    const { service } = createHarness();
    const response = await service.createDraft(researchDraft(), researchActor, context);

    expect(response.publication.lifecycleState).toBe("draft");
    expect(response.publication.evidence[0]).toMatchObject({
      id: publicEvidence.id,
      checksum: publicEvidence.checksum,
      mediaType: "application/pdf",
    });
    expect(response.originLink).toMatchObject({
      publicationId: response.publication.id,
      version: 1,
      lastSynchronizedAt: "2026-09-22T19:30:10.431Z",
    });
    expect(response.correlationId).toBe("correlation-1");
  });

  it("rejects unknown evidence and raw evidence payloads", async () => {
    const { service } = createHarness();
    await expect(
      service.createDraft(
        researchDraft({ evidenceIds: ["44444444-4444-4444-8444-444444444444"] }),
        researchActor,
        context,
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_NOT_REGISTERED" });
    await expect(
      service.createDraft(
        researchDraft({ evidence: [{ uploadBytes: "secret" }] }),
        researchActor,
        context,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("requires explicit versions for updates and rejects stale writes", async () => {
    const { service } = createHarness();
    const created = await service.createDraft(researchDraft(), researchActor, context);

    await expect(
      service.update(created.publication.id, { title: "No version" }, editorActor, context),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      service.update(
        created.publication.id,
        { title: "Stale", expectedVersion: 2 },
        editorActor,
        context,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION", status: 409 });
  });

  it("distinguishes an origin revision from an operation retry", async () => {
    const { service, repository } = createHarness();
    const idempotentContext = { ...context, idempotencyKey: "intake-42" };
    const first = await service.createDraft(researchDraft(), researchActor, idempotentContext);
    const replay = await service.createDraft(researchDraft(), researchActor, idempotentContext);
    expect(replay.publication.revision.version).toBe(1);

    await expect(
      service.createDraft(
        researchDraft({ title: "Different payload" }),
        researchActor,
        idempotentContext,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      service.createDraft(researchDraft({ title: "Origin revision" }), researchActor, context),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const revised = await service.createDraft(
      researchDraft({ title: "Origin revision", expectedVersion: 1 }),
      researchActor,
      context,
    );
    expect(revised.publication.id).toBe(first.publication.id);
    expect(revised.publication.revision.version).toBe(2);
    await expect(repository.list()).resolves.toHaveLength(1);
  });

  it("associates only stable registered evidence IDs", async () => {
    const { service } = createHarness();
    const created = await service.createDraft(
      researchDraft({ evidenceIds: [] }),
      researchActor,
      context,
    );
    const attached = await service.attachEvidence(
      created.publication.id,
      { evidenceId: publicEvidence.id, expectedVersion: 1 },
      editorActor,
      context,
    );
    expect(attached.publication.evidence[0]?.id).toBe(publicEvidence.id);
    expect(attached.publication.revision.version).toBe(2);
  });

  it("enforces external evidence visibility policy", async () => {
    const { service } = createHarness();
    await expect(
      service.createDraft(
        researchDraft({ evidenceIds: [privateEvidence.id] }),
        researchActor,
        context,
      ),
    ).rejects.toMatchObject({ code: "EVIDENCE_POLICY_VIOLATION" });
  });

  it("records sanitized audit events for successful mutations", async () => {
    const { service, repository } = createHarness();
    const created = await service.createDraft(
      researchDraft({ internalNotes: "private analyst secret" }),
      researchActor,
      context,
    );
    await service.update(
      created.publication.id,
      { title: "Edited", expectedVersion: 1 },
      editorActor,
      context,
    );

    expect(repository.auditEvents).toHaveLength(2);
    expect(repository.auditEvents[1]).toMatchObject({
      action: "publication.update",
      correlationId: "correlation-1",
      requestId: "request-1",
      previousVersion: 1,
      resultingVersion: 2,
      outcome: "succeeded",
    });
    expect(JSON.stringify(repository.auditEvents)).not.toContain("private analyst secret");
    expect(JSON.stringify(repository.auditEvents)).not.toContain(publicEvidence.checksum);
  });

  it("preserves public safety while lifecycle mutations require versions", async () => {
    const { service } = createHarness();
    const created = await service.createDraft(
      researchDraft({
        slug: "public-disclosure-check",
        visibility: "public",
        internalNotes: "Do not disclose.",
      }),
      researchActor,
      context,
    );
    const review = await service.transition(
      created.publication.id,
      { to: "review", expectedVersion: 1 },
      editorActor,
      context,
    );
    const ready = await service.transition(
      review.publication.id,
      { to: "ready", expectedVersion: 2 },
      editorActor,
      context,
    );
    await service.transition(
      ready.publication.id,
      { to: "published", expectedVersion: 3 },
      publisherActor,
      context,
    );

    const publicResponse = await service.getPublicBySlug("public-disclosure-check", {
      subjectId: "public",
      roles: ["public-reader"],
    });
    const serialized = JSON.stringify(publicResponse);
    expect(serialized).not.toContain("Do not disclose");
    expect(serialized).not.toContain("stableObjectId");
    expect(serialized).not.toContain("checksum");
    expect(serialized).not.toContain("provenance");
  });
});
