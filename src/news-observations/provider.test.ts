import { describe, expect, it } from "vitest";
import { fixtureNewsObservationProvider, fixtureObservationCorpus } from "@/news-observations/fixture-provider";
import { FixtureNewsObservationProvider } from "@/news-observations/provider";
import { buildGeographicNewsPoints } from "@/news-observations/query";

describe("fixture news observation provider", () => {
  it("reports an explicitly offline fixture capability boundary", () => {
    expect(fixtureNewsObservationProvider.capabilities).toEqual(expect.objectContaining({
      cursorPagination: true,
      temporalFiltering: true,
      topicFiltering: true,
      liveIntelligence: false,
    }));
  });

  it("returns only eligible observations in stable paged order", async () => {
    const first = await fixtureNewsObservationProvider.list({ limit: 2 });
    const second = await fixtureNewsObservationProvider.list({ limit: 2, cursor: first.nextCursor });
    expect(first.provider).toBe("fixture");
    expect(first.synthetic).toBe(true);
    expect(first.observations).toHaveLength(2);
    expect(first.observations.every((item) => !item.headline.includes("review"))).toBe(true);
    expect(new Set([...first.observations, ...second.observations].map((item) => item.observationId)).size).toBe(4);
  });

  it("filters by topic and excludes ineligible, review-required, and unknown observations", async () => {
    const results = await fixtureNewsObservationProvider.list({ topic: "maritime" });
    expect(results.observations.map((item) => item.observationId)).toEqual([
      "synthetic-strait-002",
      "synthetic-strait-001",
    ]);
    expect(await fixtureNewsObservationProvider.get("synthetic-ineligible")).toBeUndefined();
  });

  it("rejects malformed fixture records and duplicate upstream observation identities", () => {
    expect(() => new FixtureNewsObservationProvider([
      ...fixtureObservationCorpus,
      { ...fixtureObservationCorpus[0], identity: { ...fixtureObservationCorpus[0].identity, revisionId: "synthetic-revision-2" } },
    ])).toThrow("Duplicate news observation ID");
    expect(() => new FixtureNewsObservationProvider([{
      ...fixtureObservationCorpus[0],
      source: { ...fixtureObservationCorpus[0].source, canonicalUrl: "javascript:alert(1)" },
    }])).toThrow();
  });

  it("creates event-only map points and deterministic descriptive trends", async () => {
    const { observations } = await fixtureNewsObservationProvider.list({ limit: 20 });
    const points = buildGeographicNewsPoints(observations);
    const strait = points.find((point) => point.label === "Eastern Strait");
    expect(strait).toMatchObject({ publisherCount: 2, topics: ["maritime", "regional-monitoring", "transport"] });
    expect(strait?.observations).toHaveLength(2);
    expect(points.some((point) => point.label === "Capital City")).toBe(false);
    expect(observations.some((item) => item.observationId === "synthetic-no-geo")).toBe(true);
  });
});
