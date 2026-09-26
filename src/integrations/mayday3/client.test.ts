import { describe, expect, it, vi } from "vitest";
import {
  Mayday3EvidenceClient,
  Mayday3EvidenceVersionConflictError,
} from "@/integrations/mayday3/client";
import { mayday3EvidenceFixtures } from "@/integrations/mayday3/fixtures";

const response = {
  evidence: {
    ...mayday3EvidenceFixtures[0],
    registeredAt: "2026-09-25T10:05:00.000Z",
    version: 1,
  },
  correlationId: "mayday3-correlation",
};

describe("Mayday3EvidenceClient", () => {
  it("uses the shared authenticated transport for evidence-only operations", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 201 }));
    const client = new Mayday3EvidenceClient({
      baseUrl: "https://dispatch.example/",
      credential: { bearerToken: "mayday3-token" },
      fetch: fetchMock as typeof fetch,
    });
    await client.registerEvidence(mayday3EvidenceFixtures[0]!, {
      idempotencyKey: "mayday3-document-1",
      requestId: "mayday3-request",
    });
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
    expect(calls[0]?.[0].toString()).toBe("https://dispatch.example/api/evidence");
    expect(calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer mayday3-token",
        "idempotency-key": "mayday3-document-1",
      }),
    });
  });

  it("maps stale evidence writes to a typed conflict", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "STALE_VERSION", message: "stale", correlationId: "stale-evidence" },
    }), { status: 409 }));
    const client = new Mayday3EvidenceClient({
      baseUrl: "https://dispatch.example/",
      credential: { bearerToken: "mayday3-token" },
      fetch: fetchMock as typeof fetch,
    });
    await expect(client.updateEvidenceProcessingState(
      mayday3EvidenceFixtures[0]!.id,
      { expectedVersion: 1, status: "ready" },
    )).rejects.toBeInstanceOf(Mayday3EvidenceVersionConflictError);
  });
});
