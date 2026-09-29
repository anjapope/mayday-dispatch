import { z } from "zod";
import { PublicUrlSchema } from "@/domain/content-blocks";

export const NEWS_OBSERVATION_PROTOCOL = "mayday.news-observation/1" as const;

const MAX_HEADLINE_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 5_000;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_TOPICS = 20;
const MAX_TAGS = 30;
const MAX_RELATED_OBSERVATIONS = 50;
const MAX_GEOGRAPHIC_REFERENCES = 25;
const MAX_EVIDENCE_IDENTIFIERS = 50;
const MAX_LINEAGE_ENTRIES = 20;
const unsafeTextPattern = /<\/?\s*[a-z][^>]*>|(?:^|[\s"'(])(?:[a-z]:[\\/]|\\\\[^\\]+\\|\/(?:home|root|tmp|var|mnt|users|private|etc|opt|srv)\/)/i;

function observationText(maximumLength: number) {
  return z.string().trim().min(1).max(maximumLength).refine(
    (value) => !unsafeTextPattern.test(value),
    "Markup and internal filesystem paths are not permitted in observations.",
  );
}

const ObservationTextSchema = observationText(MAX_SUMMARY_LENGTH);
const HeadlineSchema = observationText(MAX_HEADLINE_LENGTH);
const IdentifierSchema = z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  "Use a stable identifier containing letters, digits, dots, underscores, colons, or hyphens.",
);
const TopicIdentifierSchema = z.string().trim().min(1).max(100).regex(
  /^[a-z][a-z0-9-]*$/,
  "Use a lowercase, hyphenated topic identifier.",
);
const SourceTagSchema = z.string().trim().min(1).max(100).refine(
  (value) => !unsafeTextPattern.test(value),
  "Markup and internal filesystem paths are not permitted in source tags.",
);
const TimestampSchema = z.string().datetime({ offset: true });

export const SourceTypeSchema = z.enum([
  "rss",
  "academic",
  "newswire",
  "government",
  "organization",
  "other",
]);
export const VerificationStateSchema = z.enum([
  "unverified",
  "corroborated",
  "verified",
  "disputed",
  "unknown",
]);
export const FreshnessStateSchema = z.enum(["current", "stale", "unknown"]);
export const GeographicRelationshipSchema = z.enum([
  "EVENT_LOCATION",
  "MENTIONED_LOCATION",
  "SOURCE_LOCATION",
  "INFERRED_RELEVANCE",
  "UNKNOWN",
  "UNRESOLVED",
]);
export const GeographicConfidenceSchema = z.enum(["unknown", "low", "medium", "high"]);
export const PublicFeedEligibilitySchema = z.enum(["eligible", "ineligible", "pending"]);
export const PublicEligibilityReasonSchema = z.enum([
  "source-not-public",
  "verification-pending",
  "safety-review",
  "geography-unresolved",
  "duplicate",
  "stale",
  "restricted-source",
  "unsupported-content",
  "policy-review",
]);

const CoordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

export const GeographicReferenceSchema = z.object({
  id: IdentifierSchema,
  placeName: observationText(300),
  coordinates: CoordinatesSchema.optional(),
  relationship: GeographicRelationshipSchema,
  confidence: GeographicConfidenceSchema,
  evidenceIds: z.array(IdentifierSchema).max(MAX_EVIDENCE_IDENTIFIERS).default([]),
  provenance: observationText(1_000).optional(),
  resolutionMethod: z.enum(["source-provided", "manual-review", "geocoder", "inferred", "unknown"]).optional(),
}).strict().superRefine((reference, context) => {
  if (
    (reference.relationship === "UNKNOWN" || reference.relationship === "UNRESOLVED") &&
    reference.coordinates
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["coordinates"],
      message: "Unknown or unresolved geographic references cannot include coordinates.",
    });
  }
  if (reference.relationship === "INFERRED_RELEVANCE" && reference.confidence === "high") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confidence"],
      message: "Inferred relevance cannot be assigned high geographic confidence.",
    });
  }
});

export const NewsObservationSchema = z.object({
  protocol: z.literal(NEWS_OBSERVATION_PROTOCOL),
  identity: z.object({
    observationId: IdentifierSchema,
    intelligenceDocumentId: IdentifierSchema,
    sourceRecordId: IdentifierSchema.optional(),
    acquisitionId: IdentifierSchema.optional(),
    revisionId: IdentifierSchema,
  }).strict(),
  source: z.object({
    headline: HeadlineSchema,
    summary: ObservationTextSchema.optional(),
    publisher: observationText(300),
    canonicalUrl: PublicUrlSchema,
    sourceType: SourceTypeSchema,
    publishedAt: TimestampSchema.optional(),
  }).strict(),
  provenance: z.object({
    originatingSystem: IdentifierSchema,
    sourceReference: IdentifierSchema,
    acquisitionReference: IdentifierSchema.optional(),
    evidenceIds: z.array(IdentifierSchema).max(MAX_EVIDENCE_IDENTIFIERS).default([]),
    verificationState: VerificationStateSchema,
    transformationLineage: z.array(observationText(1_000)).max(MAX_LINEAGE_ENTRIES).default([]),
    internalNotes: observationText(2_000).optional(),
  }).strict(),
  topics: z.object({
    identifiers: z.array(TopicIdentifierSchema).max(MAX_TOPICS).default([]),
    sourceTags: z.array(SourceTagSchema).max(MAX_TAGS).default([]),
  }).strict(),
  temporal: z.object({
    acquiredAt: TimestampSchema,
    observedAt: TimestampSchema,
    updatedAt: TimestampSchema,
    freshness: FreshnessStateSchema,
  }).strict(),
  geography: z.array(GeographicReferenceSchema).max(MAX_GEOGRAPHIC_REFERENCES).default([]),
  relatedObservationIds: z.array(IdentifierSchema).max(MAX_RELATED_OBSERVATIONS).default([]),
  publicFeed: z.object({
    eligibility: PublicFeedEligibilitySchema,
    reasons: z.array(PublicEligibilityReasonSchema).max(10).default([]),
  }).strict(),
}).strict().superRefine((observation, context) => {
  const duplicate = (values: readonly string[]) => values.find((value, index) => values.indexOf(value) !== index);
  const duplicateGeography = duplicate(observation.geography.map((reference) => reference.id));

  if (duplicate(observation.topics.identifiers)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["topics", "identifiers"], message: "Topic identifiers must be unique." });
  }
  if (duplicate(observation.topics.sourceTags.map((tag) => tag.toLocaleLowerCase()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["topics", "sourceTags"], message: "Source tags must be unique ignoring case." });
  }
  if (duplicate(observation.relatedObservationIds)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["relatedObservationIds"], message: "Related observation identifiers must be unique." });
  }
  if (duplicate(observation.provenance.evidenceIds)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["provenance", "evidenceIds"], message: "Evidence identifiers must be unique." });
  }
  if (duplicateGeography) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["geography"], message: "Geographic reference identifiers must be unique." });
  }
  if (observation.relatedObservationIds.includes(observation.identity.observationId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["relatedObservationIds"], message: "An observation cannot relate to itself." });
  }
  if (Date.parse(observation.source.publishedAt ?? observation.temporal.acquiredAt) > Date.parse(observation.temporal.acquiredAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["temporal", "acquiredAt"], message: "Acquisition cannot precede the source publication time." });
  }
  if (Date.parse(observation.temporal.acquiredAt) > Date.parse(observation.temporal.observedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["temporal", "observedAt"], message: "Observation creation cannot precede acquisition." });
  }
  if (Date.parse(observation.temporal.observedAt) > Date.parse(observation.temporal.updatedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["temporal", "updatedAt"], message: "Observation update cannot precede creation." });
  }
  if (observation.publicFeed.eligibility === "eligible" && observation.publicFeed.reasons.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["publicFeed", "reasons"], message: "Eligible observations cannot carry ineligibility reasons." });
  }
  if (observation.publicFeed.eligibility !== "eligible" && observation.publicFeed.reasons.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["publicFeed", "reasons"], message: "Pending or ineligible observations require at least one reason." });
  }
});

export type NewsObservation = z.infer<typeof NewsObservationSchema>;

export type PublicNewsObservation = {
  protocol: typeof NEWS_OBSERVATION_PROTOCOL;
  observationId: string;
  headline: string;
  summary?: string;
  publisher: string;
  canonicalUrl: string;
  sourceType: z.infer<typeof SourceTypeSchema>;
  publishedAt?: string;
  observedAt: string;
  updatedAt: string;
  freshness: z.infer<typeof FreshnessStateSchema>;
  topicIds: string[];
  sourceTags: string[];
  geography: Array<{
    id: string;
    placeName: string;
    coordinates?: { latitude: number; longitude: number };
    relationship: z.infer<typeof GeographicRelationshipSchema>;
    confidence: z.infer<typeof GeographicConfidenceSchema>;
  }>;
};

function sortStrings<T extends string>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function normalizeNewsObservation(input: unknown): NewsObservation {
  const observation = NewsObservationSchema.parse(input);
  return {
    ...observation,
    provenance: {
      ...observation.provenance,
      evidenceIds: sortStrings(observation.provenance.evidenceIds),
      transformationLineage: sortStrings(observation.provenance.transformationLineage),
    },
    topics: {
      identifiers: sortStrings(observation.topics.identifiers),
      sourceTags: [...observation.topics.sourceTags].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" })),
    },
    geography: [...observation.geography].sort((left, right) => left.id.localeCompare(right.id)).map((reference) => ({
      ...reference,
      evidenceIds: sortStrings(reference.evidenceIds),
    })),
    relatedObservationIds: sortStrings(observation.relatedObservationIds),
    publicFeed: {
      ...observation.publicFeed,
      reasons: sortStrings(observation.publicFeed.reasons),
    },
  };
}

export function normalizeNewsObservations(input: readonly unknown[]): NewsObservation[] {
  const observations = input.map(normalizeNewsObservation);
  const identifiers = new Set<string>();
  for (const observation of observations) {
    if (identifiers.has(observation.identity.observationId)) {
      throw new Error(`Duplicate news observation ID: ${observation.identity.observationId}.`);
    }
    identifiers.add(observation.identity.observationId);
  }
  return observations.sort((left, right) =>
    left.identity.observationId.localeCompare(right.identity.observationId));
}

export function toPublicNewsObservation(observation: NewsObservation): PublicNewsObservation {
  if (observation.publicFeed.eligibility !== "eligible") {
    throw new Error("Only eligible news observations can be projected for a future public feed.");
  }
  return {
    protocol: observation.protocol,
    observationId: observation.identity.observationId,
    headline: observation.source.headline,
    summary: observation.source.summary,
    publisher: observation.source.publisher,
    canonicalUrl: observation.source.canonicalUrl,
    sourceType: observation.source.sourceType,
    publishedAt: observation.source.publishedAt,
    observedAt: observation.temporal.observedAt,
    updatedAt: observation.temporal.updatedAt,
    freshness: observation.temporal.freshness,
    topicIds: [...observation.topics.identifiers],
    sourceTags: [...observation.topics.sourceTags],
    geography: observation.geography.map(({ id, placeName, coordinates, relationship, confidence }) => ({
      id,
      placeName,
      coordinates,
      relationship,
      confidence,
    })),
  };
}
