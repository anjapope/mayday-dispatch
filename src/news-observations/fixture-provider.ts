import { FixtureNewsObservationProvider } from "@/news-observations/provider";
import { NEWS_OBSERVATION_PROTOCOL, type NewsObservation } from "@/news-observations/contract";

function observation(id: string, overrides: Partial<NewsObservation> = {}): NewsObservation {
  return {
    protocol: NEWS_OBSERVATION_PROTOCOL,
    identity: { observationId: id, intelligenceDocumentId: `synthetic-document-${id}`, revisionId: "synthetic-revision-1" },
    source: {
      headline: `SYNTHETIC: ${id.replaceAll("-", " ")}`,
      summary: "Synthetic demonstration observation. It is not live Intelligence reporting.",
      publisher: "Synthetic News Desk",
      canonicalUrl: `https://example.org/synthetic/${id}`,
      sourceType: "rss",
      publishedAt: "2026-09-28T08:00:00.000Z",
    },
    provenance: {
      originatingSystem: "fixture-provider",
      sourceReference: "synthetic-source",
      evidenceIds: [],
      verificationState: "unverified",
      transformationLineage: ["Local deterministic fixture only."],
    },
    topics: { identifiers: ["regional-monitoring"], sourceTags: ["Synthetic"] },
    temporal: {
      acquiredAt: "2026-09-28T08:05:00.000Z",
      observedAt: "2026-09-28T08:06:00.000Z",
      updatedAt: "2026-09-28T08:06:00.000Z",
      freshness: "current",
    },
    geography: [],
    relatedObservationIds: [],
    publicFeed: { eligibility: "eligible", reasons: [] },
    ...overrides,
  };
}

export const fixtureObservationCorpus: readonly NewsObservation[] = [
  observation("synthetic-strait-001", {
    source: { headline: "SYNTHETIC: Eastern Strait shipping notice", summary: "Synthetic source notice for map demonstration.", publisher: "Synthetic Maritime Bulletin", canonicalUrl: "https://example.org/synthetic/strait-001", sourceType: "newswire", publishedAt: "2026-09-28T10:00:00.000Z" },
    topics: { identifiers: ["maritime", "regional-monitoring"], sourceTags: ["Synthetic", "Shipping"] },
    temporal: { acquiredAt: "2026-09-28T10:05:00.000Z", observedAt: "2026-09-28T10:06:00.000Z", updatedAt: "2026-09-28T10:06:00.000Z", freshness: "current" },
    geography: [{ id: "synthetic-eastern-strait", placeName: "Eastern Strait", coordinates: { latitude: 24, longitude: 56 }, relationship: "EVENT_LOCATION", confidence: "medium", evidenceIds: [], provenance: "Synthetic source-provided location.", resolutionMethod: "source-provided" }],
  }),
  observation("synthetic-strait-002", {
    source: { headline: "SYNTHETIC: Port advisory references Eastern Strait", summary: "Second synthetic observation at the same demonstrated location.", publisher: "Synthetic Port Authority", canonicalUrl: "https://example.org/synthetic/strait-002", sourceType: "government", publishedAt: "2026-09-28T11:00:00.000Z" },
    topics: { identifiers: ["maritime", "transport"], sourceTags: ["Synthetic", "Port"] },
    temporal: { acquiredAt: "2026-09-28T11:05:00.000Z", observedAt: "2026-09-28T11:06:00.000Z", updatedAt: "2026-09-28T11:06:00.000Z", freshness: "current" },
    geography: [{ id: "synthetic-eastern-strait", placeName: "Eastern Strait", coordinates: { latitude: 24, longitude: 56 }, relationship: "EVENT_LOCATION", confidence: "medium", evidenceIds: [], provenance: "Synthetic source-provided location.", resolutionMethod: "source-provided" }],
  }),
  observation("synthetic-multi-location", {
    source: { headline: "SYNTHETIC: Regional transport bulletin", summary: "A synthetic observation with distinct event and mentioned locations.", publisher: "Synthetic Transport Desk", canonicalUrl: "https://example.org/synthetic/transport-001", sourceType: "organization", publishedAt: "2026-09-27T09:00:00.000Z" },
    topics: { identifiers: ["transport", "regional-monitoring"], sourceTags: ["Synthetic", "Transit"] },
    temporal: { acquiredAt: "2026-09-27T09:05:00.000Z", observedAt: "2026-09-27T09:06:00.000Z", updatedAt: "2026-09-27T09:06:00.000Z", freshness: "current" },
    geography: [
      { id: "synthetic-harbor", placeName: "Harbor District", coordinates: { latitude: 25, longitude: 55 }, relationship: "EVENT_LOCATION", confidence: "medium", evidenceIds: [], provenance: "Synthetic source-provided location.", resolutionMethod: "source-provided" },
      { id: "synthetic-capital-mentioned", placeName: "Capital City", relationship: "MENTIONED_LOCATION", confidence: "low", evidenceIds: [], provenance: "Synthetic mention only.", resolutionMethod: "source-provided" },
    ],
  }),
  observation("synthetic-no-geo", {
    source: { headline: "SYNTHETIC: Research publication update", summary: "A synthetic non-geographic headline.", publisher: "Synthetic Research Journal", canonicalUrl: "https://example.org/synthetic/research-001", sourceType: "academic" },
    topics: { identifiers: ["research"], sourceTags: ["Synthetic"] },
    temporal: { acquiredAt: "2026-09-26T12:00:00.000Z", observedAt: "2026-09-26T12:01:00.000Z", updatedAt: "2026-09-26T12:01:00.000Z", freshness: "current" },
  }),
  observation("synthetic-stale", {
    source: { headline: "SYNTHETIC: Archived infrastructure notice", summary: "A stale synthetic headline retained for stale-state presentation.", publisher: "Synthetic Archive", canonicalUrl: "https://example.org/synthetic/archive-001", sourceType: "rss", publishedAt: "2026-08-01T09:00:00.000Z" },
    temporal: { acquiredAt: "2026-08-01T09:05:00.000Z", observedAt: "2026-08-01T09:06:00.000Z", updatedAt: "2026-08-01T09:06:00.000Z", freshness: "stale" },
  }),
  observation("synthetic-review", { publicFeed: { eligibility: "requires_review", reasons: ["verification-pending"] } }),
  observation("synthetic-ineligible", { publicFeed: { eligibility: "ineligible", reasons: ["restricted-source"] } }),
] as const;

export const fixtureNewsObservationProvider = new FixtureNewsObservationProvider(fixtureObservationCorpus);
