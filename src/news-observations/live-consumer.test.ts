import { describe, expect, it } from "vitest";
import { newsObservationFixtures } from "@/news-observations/fixtures";
import {
  INTELLIGENCE_CONSUMER_API_VERSION,
  LiveConsumerError,
  LiveIntelligenceObservationProvider,
  type IntelligenceConsumerCredentials,
  type IntelligenceConsumerTransport,
} from "@/news-observations/live-consumer";

const credentials: IntelligenceConsumerCredentials = {
  bearerToken: "test-only-token",
  expiresAt: "2027-01-01T00:00:00.000Z",
};

function capabilities(overrides: Record<string, unknown> = {}) {
  return {
    serviceId: "mayday-intelligence-consumer",
    apiVersion: INTELLIGENCE_CONSUMER_API_VERSION,
    observationSchemaVersion: "mayday.news-observation/1",
    operations: { listObservations: true, getObservation: true },
    pagination: { method: "cursor", maximumPageSize: 20 },
    filters: { topic: true, temporal: true },
    references: { provenance: true, source: true, geography: true },
    healthStatus: true,
    limits: { maximumResponseBytes: 100_000 },
    ...overrides,
  };
}

class MockTransport implements IntelligenceConsumerTransport {
  constructor(
    private readonly capabilityResponse: unknown = capabilities(),
    private readonly page: (query: object) => unknown = () => ({ observations: [newsObservationFixtures.validRss] }),
    private readonly observation: unknown = newsObservationFixtures.validRss,
  ) {}

  async discoverCapabilities(): Promise<unknown> {
    return this.capabilityResponse;
  }

  async getStatus(): Promise<unknown> {
    return { status: "ok" };
  }

  async listObservations(query: object): Promise<unknown> {
    return this.page(query);
  }

  async getObservation(): Promise<unknown> {
    return this.observation;
  }
}

function provider(transport: IntelligenceConsumerTransport, overrides: Partial<ConstructorParameters<typeof LiveIntelligenceObservationProvider>[0]> = {}) {
  return new LiveIntelligenceObservationProvider({
    transport,
    credentials: () => credentials,
    ...overrides,
  });
}

describe("live Intelligence observation consumer", () => {
  it("negotiates compatible versioned capabilities and returns live, non-synthetic observations", async () => {
    const consumer = provider(new MockTransport());
    const page = await consumer.list({ limit: 1, topic: "regional-monitoring", from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" });
    expect(page).toMatchObject({ provider: "live", synthetic: false, mode: "live" });
    expect(page.observations[0]).not.toHaveProperty("intelligenceDocumentId");
    expect(consumer.status.mode).toBe("live");
    await expect(consumer.health()).resolves.toEqual({ status: "ok" });
  });

  it.each([
    ["unsupported API version", capabilities({ apiVersion: "mayday.intelligence-consumer/2" })],
    ["unsupported observation schema", capabilities({ observationSchemaVersion: "mayday.news-observation/2" })],
    ["malformed capability document", { serviceId: "missing-required-fields" }],
  ])("rejects %s", async (_, capabilityResponse) => {
    const consumer = provider(new MockTransport(capabilityResponse));
    await expect(consumer.list()).rejects.toMatchObject({ code: "capability-incompatible" });
    expect(consumer.status.mode).toBe("unavailable");
  });

  it("fails closed for missing, expired, and rejected credentials without exposing them", async () => {
    const missing = new LiveIntelligenceObservationProvider({ transport: new MockTransport(), credentials: () => undefined });
    const expired = new LiveIntelligenceObservationProvider({ transport: new MockTransport(), credentials: () => ({ ...credentials, expiresAt: "2020-01-01T00:00:00.000Z" }) });
    const rejected = provider(new MockTransport(capabilities(), () => { throw new LiveConsumerError("authentication-failed", "rejected"); }));
    await expect(missing.list()).rejects.toMatchObject({ code: "authentication-failed" });
    await expect(expired.list()).rejects.toMatchObject({ code: "authentication-failed" });
    await expect(rejected.list()).rejects.toMatchObject({ code: "authentication-failed" });
    expect(rejected.status).toMatchObject({ mode: "unavailable", detail: "authentication-failed" });
  });

  it("enforces bounded page sizes, page counts, cursors, and retries", async () => {
    let attempts = 0;
    const retrying = provider(new MockTransport(capabilities(), () => {
      attempts += 1;
      if (attempts === 1) throw new LiveConsumerError("timeout", "timeout");
      return { observations: [newsObservationFixtures.validRss] };
    }), { retryCeiling: 1 });
    await expect(retrying.list({ limit: 21 })).rejects.toThrow("integer from 1 to 20");
    await retrying.list({ limit: 1 });
    expect(attempts).toBe(2);

    const paged = provider(new MockTransport(capabilities(), (query: { cursor?: string }) => ({ observations: [newsObservationFixtures.validRss], nextCursor: query.cursor === "next" ? "final" : "next" })), { maxPagesPerOperation: 2 });
    await expect(paged.listBounded({ limit: 1 })).rejects.toMatchObject({ code: "invalid-response" });
    const malformed = provider(new MockTransport(capabilities(), () => ({ observations: [], nextCursor: "bad cursor" })));
    await expect(malformed.list()).rejects.toMatchObject({ code: "invalid-response" });
    const oversized = provider(new MockTransport(capabilities({ limits: { maximumResponseBytes: 1 } })));
    await expect(oversized.list()).rejects.toMatchObject({ code: "invalid-response" });
  });

  it("rejects oversized, duplicate, malformed, and non-eligible upstream observations without elevation", async () => {
    const duplicate = { ...newsObservationFixtures.validRss, identity: { ...newsObservationFixtures.validRss.identity, revisionId: "revision-2" } };
    const invalid = provider(new MockTransport(capabilities(), () => ({ observations: [newsObservationFixtures.validRss, duplicate] })));
    await expect(invalid.list({ limit: 2 })).rejects.toMatchObject({ code: "invalid-response" });

    const nonEligible = provider(new MockTransport(capabilities(), () => ({
      observations: [
        {
          ...newsObservationFixtures.requiresReviewEligibility,
          identity: { ...newsObservationFixtures.requiresReviewEligibility.identity, observationId: "requires-review-live", intelligenceDocumentId: "document-requires-review-live" },
        },
        {
          ...newsObservationFixtures.ineligible,
          identity: { ...newsObservationFixtures.ineligible.identity, observationId: "ineligible-live", intelligenceDocumentId: "document-ineligible-live" },
        },
      ],
    })));
    await expect(nonEligible.list()).resolves.toMatchObject({ observations: [] });
  });

  it("handles rate limits, outages, and timeouts as explicit degraded states", async () => {
    for (const code of ["rate-limited", "service-unavailable", "timeout"] as const) {
      const consumer = provider(new MockTransport(capabilities(), () => { throw new LiveConsumerError(code, code); }));
      await expect(consumer.list()).rejects.toMatchObject({ code });
      expect(consumer.status).toMatchObject({ mode: "degraded", detail: code });
    }
  });

  it("only supports typed read operations and preserves geographic/feed safeguards through canonical projection", async () => {
    const consumer = provider(new MockTransport());
    expect(consumer).not.toHaveProperty("write");
    expect(consumer).not.toHaveProperty("publish");
    expect(await consumer.get("tgh-observation-rss-001")).not.toHaveProperty("evidenceIds");
  });
});
