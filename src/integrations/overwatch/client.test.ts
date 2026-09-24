import { describe, expect, it, vi } from "vitest";
import {
  OverwatchDispatchClient,
  OverwatchEditorialLockError,
  OverwatchVersionConflictError,
} from "@/integrations/overwatch/client";

const response = {
  publication: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    slug: "situation-report",
    type: "situation-report",
    lifecycleState: "draft",
    visibility: "internal" as const,
    title: "Situation report",
    excerpt: "Summary",
    body: ["Body"],
    publishedAt: "2026-09-24",
    readingTimeMinutes: 2,
    tags: ["monitoring"],
    revision: { version: 1, updatedAt: "2026-09-24T12:00:00Z", summary: "Created." },
    provenance: {
      origin: {
        kind: "open-source-intelligence",
        label: "Mayday Overwatch",
        url: "https://example.org/methodology",
        originatingApplication: "overwatch",
        originatingProject: "monitor-1",
        stableObjectId: "object-1",
      },
      createdBy: "Overwatch",
      createdAt: "2026-09-24T12:00:00Z",
      verificationStatus: "unverified",
    },
    extensions: {},
    evidence: [],
    sources: [],
  },
  originLink: {
    publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    version: 1,
    editorialUrl: "/editor/publications/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    origin: {
      kind: "open-source-intelligence",
      label: "Mayday Overwatch",
      url: "https://example.org/methodology",
      originatingApplication: "overwatch",
      originatingProject: "monitor-1",
      stableObjectId: "object-1",
    },
    lastSynchronizedAt: "2026-09-24T12:00:00Z",
  },
  correlationId: "correlation-overwatch",
};

const input = {
  overwatchObjectId: "object-1",
  projectId: "monitor-1",
  title: "Situation report",
  summary: "Summary",
  body: ["Body"],
  publicationType: "situation-report",
  slug: "situation-report",
  readingTimeMinutes: 2,
  citations: [{
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Public source",
    authors: ["Analyst"],
    url: "https://example.org/source",
  }],
  idempotencyKey: "ow-operation-1",
};

describe("OverwatchDispatchClient", () => {
  it("submits an origin-owned publication with assessment extensions and idempotency", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(response), { status: 201 }));
    const client = new OverwatchDispatchClient({
      baseUrl: "https://dispatch.example/",
      credential: { bearerToken: "overwatch-token" },
      fetch: fetchMock as typeof fetch,
    });

    await client.submit({ ...input, assessment: { confidenceLevel: "moderate" } });

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
    expect(calls[0]?.[0]?.toString()).toBe("https://dispatch.example/api/publications");
    const requestInit = calls[0]?.[1];
    expect(requestInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer overwatch-token",
        "idempotency-key": "ow-operation-1",
      }),
    });
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      origin: {
        originatingApplication: "overwatch",
        originatingProject: "monitor-1",
        stableObjectId: "object-1",
      },
      extensions: { overwatch: { assessment: { confidenceLevel: "moderate" } } },
    });
  });

  it("maps synchronization conflicts to typed errors", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: "STALE_VERSION",
        message: "stale",
        correlationId: "conflict",
      },
    }), { status: 409 }));
    const client = new OverwatchDispatchClient({
      baseUrl: "https://dispatch.example/",
      credential: { bearerToken: "overwatch-token" },
      fetch: fetchMock as typeof fetch,
    });
    await expect(client.update(response.publication.id, { ...input, expectedVersion: 1 }))
      .rejects.toBeInstanceOf(OverwatchVersionConflictError);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: "EDITORIAL_LOCK",
        message: "locked",
        correlationId: "lock",
        details: { publicationId: response.publication.id, currentVersion: 2, currentLifecycleState: "review" },
      },
    }), { status: 409 }));
    await expect(client.update(response.publication.id, { ...input, expectedVersion: 1 }))
      .rejects.toBeInstanceOf(OverwatchEditorialLockError);
  });
});
