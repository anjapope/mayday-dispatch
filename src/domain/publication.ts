import { z } from "zod";

export const PublicationTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/, "Use a lowercase, hyphenated publication type.");

export const LifecycleStateSchema = z.enum([
  "draft",
  "review",
  "ready",
  "published",
  "updated",
  "archived",
]);

export type LifecycleState = z.infer<typeof LifecycleStateSchema>;

const lifecycleTransitions: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  draft: ["review", "archived"],
  review: ["draft", "ready", "archived"],
  ready: ["review", "published", "archived"],
  published: ["updated", "archived"],
  updated: ["updated", "archived"],
  archived: [],
};

export function canTransitionLifecycle(
  from: LifecycleState,
  to: LifecycleState,
): boolean {
  return lifecycleTransitions[from].includes(to);
}

export function assertLifecycleTransition(
  from: LifecycleState,
  to: LifecycleState,
): void {
  if (!canTransitionLifecycle(from, to)) {
    throw new Error(`Cannot transition a publication from "${from}" to "${to}".`);
  }
}

export const EvidenceVisibilitySchema = z.enum([
  "private",
  "internal",
  "citation-only",
  "public",
]);

export const PublicationVisibilitySchema = EvidenceVisibilitySchema;

export const CitationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1),
  subtitle: z.string().trim().min(1).optional(),
  authors: z.array(z.string().trim().min(1)).min(1),
  publisher: z.string().trim().min(1).optional(),
  publishedAt: z.string().date().optional(),
  url: z.string().url().optional(),
  doi: z.string().regex(/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i).optional(),
});

export const EvidenceReferenceSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    url: z.string().url().optional(),
    locator: z.string().trim().min(1).optional(),
    visibility: EvidenceVisibilitySchema,
    mediaType: z.string().trim().min(1).optional(),
    source: z.string().trim().min(1).optional(),
    evidenceProvenance: z.string().trim().min(1).optional(),
    checksum: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
    processor: z.string().trim().min(1).optional(),
    status: z.enum(["registered", "processing", "ready", "rejected"]).optional(),
    evidenceVersion: z.number().int().positive().optional(),
    checksumAlgorithm: z.literal("sha256").optional(),
    acquisitionAt: z.string().datetime({ offset: true }).optional(),
    processedAt: z.string().datetime({ offset: true }).optional(),
    parentEvidenceId: z.string().uuid().optional(),
    derivationType: z.string().trim().min(1).optional(),
    citation: CitationSchema.optional(),
  })
  .superRefine((evidence, context) => {
    if (evidence.visibility === "citation-only" && !evidence.citation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Citation-only evidence requires citation metadata.",
        path: ["citation"],
      });
    }
    if (evidence.visibility === "public" && !evidence.url && !evidence.citation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Public evidence requires a URL or citation metadata.",
        path: ["url"],
      });
    }
  });

export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export const PublicationOriginSchema = z
  .object({
    kind: z.enum([
      "original-reporting",
      "academic-publication",
      "open-source-intelligence",
      "partner-submission",
    ]),
    label: z.string().trim().min(1),
    url: z.string().url().optional(),
    originatingApplication: z.string().trim().min(1),
    originatingProject: z.string().trim().min(1),
    stableObjectId: z
      .string()
      .trim()
      .min(1)
      .regex(
        /^[^\\/]+$/,
        "Use a stable object ID, not a filesystem path.",
      ),
  })
  .superRefine((origin, context) => {
    if (
      (origin.kind === "academic-publication" ||
        origin.kind === "open-source-intelligence") &&
      !origin.url
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${origin.kind} origins require a source URL.`,
        path: ["url"],
      });
    }
  });

export const ProvenanceSchema = z.object({
  origin: PublicationOriginSchema,
  createdBy: z.string().trim().min(1),
  createdAt: z.string().datetime({ offset: true }),
  verificationStatus: z.enum(["unverified", "corroborated", "verified"]),
  internalNotes: z.string().trim().min(1).optional(),
});

export const PublicationExtensionsSchema = z.record(z.unknown()).default({});
export type PublicationExtensions = z.infer<typeof PublicationExtensionsSchema>;

export const RevisionMetadataSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
  summary: z.string().trim().min(1),
  previousVersion: z.number().int().positive().optional(),
  revisionType: z.enum([
    "upstream-synchronization",
    "editorial",
    "lifecycle-transition",
    "correction",
    "substantive-update",
    "archive",
  ]).default("editorial"),
});

export const PublicationSchema = z
  .object({
    id: z.string().uuid(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase, hyphenated slug."),
    type: PublicationTypeSchema,
    lifecycleState: LifecycleStateSchema,
    visibility: PublicationVisibilitySchema,
    title: z.string().trim().min(1),
    subtitle: z.string().trim().min(1).optional(),
    excerpt: z.string().trim().min(1),
    body: z.array(z.string().trim().min(1)).min(1),
    publishedAt: z.string().date(),
    readingTimeMinutes: z.number().int().positive(),
    tags: z.array(z.string().trim().min(1)).default([]),
    revision: RevisionMetadataSchema,
    provenance: ProvenanceSchema,
    extensions: PublicationExtensionsSchema,
    evidence: z.array(EvidenceReferenceSchema).default([]),
    sources: z.array(CitationSchema).default([]),
  })
  .superRefine((publication, context) => {
    if (
      (publication.lifecycleState === "published" ||
        publication.lifecycleState === "updated") &&
      publication.sources.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published and updated publications require at least one source.",
        path: ["sources"],
      });
    }
    if (
      publication.revision.previousVersion !== undefined &&
      publication.revision.previousVersion >= publication.revision.version
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The previous revision must be lower than the current version.",
        path: ["revision", "previousVersion"],
      });
    }
  });

export type Publication = z.infer<typeof PublicationSchema>;

export type PublicEvidence = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  citation?: z.infer<typeof CitationSchema>;
};

export const PublicNoticeSchema = z.object({
  kind: z.enum(["correction", "update"]),
  note: z.string().trim().min(1),
  timestamp: z.string().datetime({ offset: true }),
  version: z.number().int().positive(),
  explanation: z.string().trim().min(1).optional(),
});

export type PublicNotice = z.infer<typeof PublicNoticeSchema>;

export type PublicPublication = Pick<
  Publication,
  | "id"
  | "slug"
  | "type"
  | "lifecycleState"
  | "title"
  | "subtitle"
  | "excerpt"
  | "body"
  | "publishedAt"
  | "readingTimeMinutes"
  | "tags"
  | "revision"
  | "sources"
> & {
  evidence: PublicEvidence[];
  methodology?: string;
  caveat?: string;
  seriesId?: string;
  reportingPeriod?: string;
  notice?: PublicNotice;
  relatedPublicationIds?: string[];
};

export function toPublicPublication(publication: Publication): PublicPublication {
  if (publication.visibility !== "public") {
    throw new Error(
      `Cannot create a public projection for a "${publication.visibility}" publication.`,
    );
  }

  return {
    id: publication.id,
    slug: publication.slug,
    type: publication.type,
    lifecycleState: publication.lifecycleState,
    title: publication.title,
    subtitle: publication.subtitle,
    excerpt: publication.excerpt,
    body: publication.body,
    publishedAt: publication.publishedAt,
    readingTimeMinutes: publication.readingTimeMinutes,
    tags: publication.tags,
    revision: publication.revision,
    sources: publication.sources,
    methodology:
      typeof publication.extensions.methodology === "string"
        ? publication.extensions.methodology
        : undefined,
    caveat:
      typeof publication.extensions.caveat === "string"
        ? publication.extensions.caveat
        : undefined,
    seriesId:
      typeof (publication.extensions.overwatch as Record<string, unknown> | undefined)?.seriesId === "string"
        ? String((publication.extensions.overwatch as Record<string, unknown>).seriesId)
        : undefined,
    reportingPeriod:
      typeof (publication.extensions.overwatch as Record<string, unknown> | undefined)?.reportingPeriod === "string"
        ? String((publication.extensions.overwatch as Record<string, unknown>).reportingPeriod)
        : undefined,
    notice:
      publication.extensions.publicNotice &&
      typeof publication.extensions.publicNotice === "object"
        ? PublicNoticeSchema.parse(publication.extensions.publicNotice)
        : undefined,
    relatedPublicationIds: Array.isArray(publication.extensions.relatedPublicationIds)
      ? publication.extensions.relatedPublicationIds.filter(
          (value): value is string => typeof value === "string",
        )
      : undefined,
    evidence: publication.evidence
      .filter((evidence) => evidence.visibility === "public" || evidence.visibility === "citation-only")
      .map(({ id, title, description, url, citation }) => ({
        id,
        title,
        description,
        url,
        citation,
      })),
  };
}
