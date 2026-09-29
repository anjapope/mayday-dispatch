import { describe, expect, it } from "vitest";
import {
  NEWS_OBSERVATION_PROTOCOL,
  NewsObservationSchema,
  normalizeNewsObservation,
  normalizeNewsObservations,
  toPublicNewsObservation,
} from "@/news-observations/contract";
import { newsObservationFixtures } from "@/news-observations/fixtures";

describe("news observation contract", () => {
  it("accepts representative RSS, academic, geographic, and no-geography observations", () => {
    for (const observation of [
      newsObservationFixtures.validRss,
      newsObservationFixtures.academic,
      newsObservationFixtures.multipleGeographies,
      newsObservationFixtures.verifiedEventLocation,
      newsObservationFixtures.mentionedLocation,
      newsObservationFixtures.sourceLocation,
      newsObservationFixtures.inferredRelevance,
      newsObservationFixtures.noGeography,
      newsObservationFixtures.noPublishedAt,
      newsObservationFixtures.unverifiedSource,
    ]) {
      expect(NewsObservationSchema.safeParse(observation).success).toBe(true);
    }
  });

  it("preserves each geographic relationship and validates coordinates", () => {
    const observation = NewsObservationSchema.parse(newsObservationFixtures.multipleGeographies);
    expect(observation.geography.map((reference) => reference.relationship)).toEqual(["EVENT_LOCATION", "SOURCE_LOCATION"]);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.multipleGeographies,
      geography: [{ ...newsObservationFixtures.multipleGeographies.geography[0], coordinates: { latitude: 91, longitude: 56 } }],
    }).success).toBe(false);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.noGeography,
      geography: [{ id: "geo-unresolved", placeName: "Unknown", relationship: "UNRESOLVED", confidence: "unknown", evidenceIds: [], coordinates: { latitude: 1, longitude: 1 } }],
    }).success).toBe(false);
  });

  it("rejects unsupported versions, malformed source values, and oversized data", () => {
    expect(NewsObservationSchema.safeParse({ ...newsObservationFixtures.validRss, protocol: "mayday.news-observation/2" }).success).toBe(false);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.validRss,
      source: { ...newsObservationFixtures.validRss.source, canonicalUrl: "file:///restricted/source" },
    }).success).toBe(false);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.validRss,
      source: { ...newsObservationFixtures.validRss.source, headline: "a".repeat(501) },
    }).success).toBe(false);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.validRss,
      relatedObservationIds: Array.from({ length: 51 }, (_, index) => `related-${index}`),
    }).success).toBe(false);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.validRss,
      provenance: { ...newsObservationFixtures.validRss.provenance, unexpectedInternalField: "not allowed" },
    }).success).toBe(false);
  });

  it("rejects duplicate references and inconsistent temporal information", () => {
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.multipleGeographies,
      geography: [
        newsObservationFixtures.multipleGeographies.geography[0],
        { ...newsObservationFixtures.multipleGeographies.geography[0] },
      ],
    }).success).toBe(false);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.validRss,
      relatedObservationIds: ["tgh-observation-other", "tgh-observation-other"],
    }).success).toBe(false);
    expect(NewsObservationSchema.safeParse({
      ...newsObservationFixtures.validRss,
      temporal: {
        ...newsObservationFixtures.validRss.temporal,
        acquiredAt: "2026-09-28T08:00:00.000Z",
      },
    }).success).toBe(false);
  });

  it("normalizes equivalent array order deterministically without elevating status", () => {
    const first = normalizeNewsObservation({
      ...newsObservationFixtures.multipleGeographies,
      topics: { identifiers: ["transport", "regional-monitoring"], sourceTags: ["Guidance", "Crossing"] },
      geography: [...newsObservationFixtures.multipleGeographies.geography].reverse(),
      relatedObservationIds: ["tgh-observation-z", "tgh-observation-a"],
    });
    const second = normalizeNewsObservation({
      ...newsObservationFixtures.multipleGeographies,
      topics: { identifiers: ["regional-monitoring", "transport"], sourceTags: ["Crossing", "Guidance"] },
      relatedObservationIds: ["tgh-observation-a", "tgh-observation-z"],
    });
    expect(first).toEqual(second);
    expect(normalizeNewsObservation(newsObservationFixtures.pendingEligibility).publicFeed.eligibility).toBe("pending");
    expect(normalizeNewsObservation({
      ...newsObservationFixtures.validRss,
      provenance: { ...newsObservationFixtures.validRss.provenance, verificationState: "unknown" },
    }).provenance.verificationState).toBe("unknown");
  });

  it("rejects duplicate observation identities in a synchronization batch", () => {
    expect(() => normalizeNewsObservations([
      newsObservationFixtures.validRss,
      { ...newsObservationFixtures.validRss, identity: { ...newsObservationFixtures.validRss.identity, revisionId: "revision-002" } },
    ])).toThrow("Duplicate news observation ID");
  });

  it("creates an allowlisted public projection only for eligible observations", () => {
    const publicObservation = toPublicNewsObservation(normalizeNewsObservation(newsObservationFixtures.multipleGeographies));
    expect(publicObservation).toMatchObject({
      protocol: NEWS_OBSERVATION_PROTOCOL,
      observationId: "tgh-observation-rss-001",
      headline: newsObservationFixtures.validRss.source.headline,
    });
    expect(publicObservation).not.toHaveProperty("intelligenceDocumentId");
    expect(publicObservation).not.toHaveProperty("evidenceIds");
    expect(publicObservation.geography[0]).not.toHaveProperty("provenance");
    expect(() => toPublicNewsObservation(normalizeNewsObservation(newsObservationFixtures.ineligible))).toThrow("Only eligible");
  });
});
