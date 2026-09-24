import { describe, expect, it, vi } from "vitest";
import {
  ResearchStudioAuthorizationError,
  ResearchStudioDispatchClient,
  ResearchStudioEditorialLockError,
  ResearchStudioOriginConflictError,
  ResearchStudioVersionConflictError,
} from "@/integrations/research-studio/client";

const publicationResponse = {
  publication: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    slug: "linked-draft",
    type: "research-report",
    lifecycleState: "draft",
    visibility: "internal",
    title: "Linked draft",
    excerpt: "Contract response.",
    body: ["Body"],
    publishedAt: "2026-09-22",
    readingTimeMinutes: 2,
    tags: [],
    revision: {
      version: 1,
      updatedAt: "2026-09-22T19:30:10.431Z",
      summary: "Created.",
    },
    provenance: {
      origin: {
        kind: "partner-submission",
        label: "Research Studio",
        originatingApplication: "Research Studio",
        originatingProject: "Desk",
        stableObjectId: "research:1",
      },
      createdBy: "Research Studio",
      createdAt: "2026-09-22T19:30:10.431Z",
      verificationStatus: "unverified",
    },
    evidence: [],
    sources: [],
  },
  originLink: {
    publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    version: 1,
    editorialUrl: "/editor/publications/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    origin: {
      kind: "partner-submission",
      label: "Research Studio",
      originatingApplication: "Research Studio",
      originatingProject: "Desk",
      stableObjectId: "research:1",
    },
    lastSynchronizedAt: "2026-09-22T19:30:10.431Z",
  },
  correlationId: "correlation-client",
};

describe("ResearchStudioDispatchClient", () => {
  it("implements create, retrieve, evidence, update, and lifecycle request contracts", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(publicationResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.example/",
      applicationName: "Research Studio",
      credential: { bearerToken: "research-studio-token" },
      fetch: fetchMock as typeof fetch,
    });

    await client.createDraft({} as never, {
      idempotencyKey: "operation-1",
      requestId: "request-client",
      correlationId: "correlation-client",
    });
    await client.retrieveLinkedPublication(publicationResponse.publication.id);
    await expect(client.retrieveCurrentVersion(publicationResponse.publication.id)).resolves.toBe(1);
    await client.updateDraft(publicationResponse.publication.id, {} as never);
    await client.attachEvidence(publicationResponse.publication.id, {} as never);
    await client.requestLifecycle(publicationResponse.publication.id, {} as never);

    const calls = fetchMock.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit | undefined]
    >;
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(calls[0]?.[0].toString()).toBe(
      "https://dispatch.example/api/publications",
    );
    expect(calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "idempotency-key": "operation-1",
        authorization: "Bearer research-studio-token",
        "x-request-id": "request-client",
        "x-correlation-id": "correlation-client",
      }),
    });
    expect(calls[1]?.[1]).toMatchObject({ method: "GET" });
  });

  it("turns stable stale-version errors into a typed client conflict", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "STALE_VERSION",
            message: "The publication version is stale.",
            correlationId: "correlation-conflict",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.example/",
      applicationName: "Research Studio",
      credential: { bearerToken: "research-studio-token" },
      fetch: fetchMock as typeof fetch,
    });

    await expect(
      client.updateDraft(publicationResponse.publication.id, {} as never),
    ).rejects.toBeInstanceOf(ResearchStudioVersionConflictError);
  });

  it.each([
    ["ORIGIN_CONFLICT", ResearchStudioOriginConflictError],
    ["UNAUTHORIZED", ResearchStudioAuthorizationError],
  ])("turns %s into its typed machine-client error", async (code, errorType) => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code,
            message: "Request rejected.",
            correlationId: "correlation-conflict",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.example/",
      applicationName: "Research Studio",
      credential: { bearerToken: "research-studio-token" },
      fetch: fetchMock as typeof fetch,
    });

    await expect(client.createDraft({} as never)).rejects.toBeInstanceOf(errorType);
  });

  it("turns an editorial lock into a typed error with current linkage state", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "EDITORIAL_LOCK",
            message: "External synchronization is locked.",
            correlationId: "correlation-lock",
            details: {
              publicationId: publicationResponse.publication.id,
              currentVersion: 4,
              currentLifecycleState: "review",
            },
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.example/",
      applicationName: "Research Studio",
      credential: { bearerToken: "research-studio-token" },
      fetch: fetchMock as typeof fetch,
    });

    await expect(client.createDraft({} as never)).rejects.toMatchObject(
      new ResearchStudioEditorialLockError(
        409,
        "correlation-lock",
        publicationResponse.publication.id,
        4,
        "review",
      ),
    );
  });
});
