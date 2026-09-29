import type { NewsObservation } from "@/news-observations/contract";
import { NEWS_OBSERVATION_PROTOCOL } from "@/news-observations/contract";

const baseObservation: NewsObservation = {
  protocol: NEWS_OBSERVATION_PROTOCOL,
  identity: {
    observationId: "tgh-observation-rss-001",
    intelligenceDocumentId: "intelligence-document-rss-001",
    sourceRecordId: "rss-item-001",
    acquisitionId: "acquisition-run-001",
    revisionId: "revision-001",
  },
  source: {
    headline: "Regional authority issues revised crossing guidance",
    summary: "The authority published updated guidance for scheduled crossings.",
    publisher: "Regional Transport Authority",
    canonicalUrl: "https://example.org/notices/crossing-guidance",
    sourceType: "rss",
    publishedAt: "2026-09-28T09:00:00.000Z",
  },
  provenance: {
    originatingSystem: "mayday-intelligence",
    sourceReference: "rss-source-regional-transport",
    acquisitionReference: "collection-run-001",
    evidenceIds: ["evidence-public-001"],
    verificationState: "unverified",
    transformationLineage: ["RSS metadata normalized without editorial interpretation."],
  },
  topics: {
    identifiers: ["transport", "regional-monitoring"],
    sourceTags: ["Crossing", "Guidance"],
  },
  temporal: {
    acquiredAt: "2026-09-28T09:05:00.000Z",
    observedAt: "2026-09-28T09:06:00.000Z",
    updatedAt: "2026-09-28T09:06:00.000Z",
    freshness: "current",
  },
  geography: [],
  relatedObservationIds: [],
  publicFeed: {
    eligibility: "eligible",
    reasons: [],
  },
};

export const newsObservationFixtures = {
  validRss: baseObservation,
  academic: {
    ...baseObservation,
    identity: {
      observationId: "tgh-observation-academic-001",
      intelligenceDocumentId: "intelligence-document-academic-001",
      revisionId: "revision-001",
    },
    source: {
      ...baseObservation.source,
      headline: "Study evaluates regional heat-response thresholds",
      canonicalUrl: "https://example.edu/research/heat-response",
      sourceType: "academic",
    },
    geography: [{
      id: "geo-study-region",
      placeName: "Study Region",
      relationship: "MENTIONED_LOCATION",
      confidence: "medium",
      evidenceIds: [],
      resolutionMethod: "source-provided",
    }],
  },
  multipleGeographies: {
    ...baseObservation,
    geography: [
      {
        id: "geo-event",
        placeName: "Eastern Strait",
        coordinates: { latitude: 24, longitude: 56 },
        relationship: "EVENT_LOCATION",
        confidence: "high",
        evidenceIds: ["evidence-public-001"],
        resolutionMethod: "source-provided",
      },
      {
        id: "geo-source",
        placeName: "Capital City",
        coordinates: { latitude: 25.2, longitude: 55.3 },
        relationship: "SOURCE_LOCATION",
        confidence: "medium",
        evidenceIds: [],
        resolutionMethod: "source-provided",
      },
    ],
  },
  verifiedEventLocation: {
    ...baseObservation,
    provenance: {
      ...baseObservation.provenance,
      verificationState: "verified",
    },
    geography: [{
      id: "geo-verified-event",
      placeName: "Eastern Strait",
      coordinates: { latitude: 24, longitude: 56 },
      relationship: "EVENT_LOCATION",
      confidence: "high",
      evidenceIds: ["evidence-public-001"],
      resolutionMethod: "manual-review",
    }],
  },
  mentionedLocation: {
    ...baseObservation,
    geography: [{
      id: "geo-mentioned",
      placeName: "Northern Corridor",
      relationship: "MENTIONED_LOCATION",
      confidence: "low",
      evidenceIds: [],
      resolutionMethod: "source-provided",
    }],
  },
  sourceLocation: {
    ...baseObservation,
    geography: [{
      id: "geo-source-only",
      placeName: "Capital City",
      coordinates: { latitude: 25.2, longitude: 55.3 },
      relationship: "SOURCE_LOCATION",
      confidence: "medium",
      evidenceIds: [],
      resolutionMethod: "source-provided",
    }],
  },
  inferredRelevance: {
    ...baseObservation,
    geography: [{
      id: "geo-inferred",
      placeName: "Maritime Region",
      relationship: "INFERRED_RELEVANCE",
      confidence: "medium",
      evidenceIds: [],
      resolutionMethod: "inferred",
    }],
  },
  noGeography: baseObservation,
  noPublishedAt: {
    ...baseObservation,
    source: {
      ...baseObservation.source,
      publishedAt: undefined,
    },
  },
  unverifiedSource: {
    ...baseObservation,
    provenance: {
      ...baseObservation.provenance,
      verificationState: "unverified",
    },
  },
  pendingEligibility: {
    ...baseObservation,
    publicFeed: { eligibility: "pending", reasons: ["verification-pending"] },
  },
  ineligible: {
    ...baseObservation,
    publicFeed: { eligibility: "ineligible", reasons: ["restricted-source"] },
  },
} as const satisfies Record<string, NewsObservation>;
