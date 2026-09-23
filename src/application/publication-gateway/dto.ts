import { z } from "zod";
import {
  CitationSchema,
  LifecycleStateSchema,
  PublicationSchema,
  PublicationTypeSchema,
  PublicationVisibilitySchema,
  RevisionMetadataSchema,
} from "@/domain/publication";
import { GatewayErrorCodeSchema } from "@/application/publication-gateway/errors";

const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase, hyphenated slug.");

const DraftContentSchema = z.object({
  slug: SlugSchema,
  type: PublicationTypeSchema,
  title: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  body: z.array(z.string().trim().min(1)).min(1),
  publishedAt: z.string().date().optional(),
  readingTimeMinutes: z.number().int().positive(),
  tags: z.array(z.string().trim().min(1)).default([]),
  visibility: PublicationVisibilitySchema.default("internal"),
  sources: z.array(CitationSchema).default([]),
});

export const PublicationOriginInputSchema = z
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
      .regex(/^[^\\/]+$/, "Use a stable object ID, not a filesystem path."),
  })
  .strict()
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

export const CreateDraftPublicationRequestSchema = DraftContentSchema.extend({
  lifecycleState: LifecycleStateSchema.optional(),
  origin: PublicationOriginInputSchema,
  createdBy: z.string().trim().min(1),
  verificationStatus: z.enum(["unverified", "corroborated", "verified"]).default("unverified"),
  internalNotes: z.string().trim().min(1).optional(),
  evidenceIds: z.array(z.string().uuid()).default([]),
  expectedVersion: z.number().int().nonnegative().optional(),
}).strict();

export const UpdatePublicationRequestSchema = DraftContentSchema.partial()
  .extend({
    verificationStatus: z.enum(["unverified", "corroborated", "verified"]).optional(),
    internalNotes: z.string().trim().min(1).optional(),
    revisionSummary: z.string().trim().min(1).default("Editorial update."),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine(
    (input) =>
      Object.keys(input).some(
        (key) => key !== "revisionSummary" && key !== "expectedVersion",
      ),
    "At least one publication field must be provided.",
  );

export const AttachEvidenceRequestSchema = z
  .object({
    evidenceId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    revisionSummary: z.string().trim().min(1).default("Evidence attached."),
  })
  .strict();

export const TransitionPublicationRequestSchema = z
  .object({
    to: LifecycleStateSchema,
    expectedVersion: z.number().int().positive(),
    revisionSummary: z.string().trim().min(1).default("Lifecycle transition."),
  })
  .strict();

export const GatewayPublicationResponseSchema = z
  .object({
    publication: PublicationSchema,
    originLink: z.object({
      publicationId: z.string().uuid(),
      version: z.number().int().positive(),
      editorialUrl: z.string(),
      publicUrl: z.string().optional(),
      origin: PublicationOriginInputSchema,
      lastSynchronizedAt: z.string().datetime({ offset: true }),
    }),
    correlationId: z.string().min(1),
  })
  .strict();

export const GatewayPublicationListResponseSchema = z
  .object({
    publications: z.array(PublicationSchema),
  })
  .strict();

export const GatewayErrorResponseSchema = z
  .object({
    error: z.object({
      code: GatewayErrorCodeSchema,
      message: z.string(),
      correlationId: z.string().min(1),
      details: z.record(z.unknown()).optional(),
    }),
  })
  .strict();

export const PublicEvidenceResponseSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    citation: CitationSchema.optional(),
  })
  .strict();

export const PublicPublicationResponseSchema = z
  .object({
    publication: z
      .object({
        id: z.string().uuid(),
        slug: SlugSchema,
        type: PublicationTypeSchema,
        lifecycleState: z.enum(["published", "updated"]),
        title: z.string(),
        excerpt: z.string(),
        body: z.array(z.string()),
        publishedAt: z.string().date(),
        readingTimeMinutes: z.number().int().positive(),
        tags: z.array(z.string()),
        revision: RevisionMetadataSchema,
        sources: z.array(CitationSchema),
        evidence: z.array(PublicEvidenceResponseSchema),
      })
      .strict(),
  })
  .strict();

export type CreateDraftPublicationRequest = z.infer<typeof CreateDraftPublicationRequestSchema>;
export type UpdatePublicationRequest = z.infer<typeof UpdatePublicationRequestSchema>;
export type AttachEvidenceRequest = z.infer<typeof AttachEvidenceRequestSchema>;
export type TransitionPublicationRequest = z.infer<typeof TransitionPublicationRequestSchema>;
export type GatewayPublicationResponse = z.infer<typeof GatewayPublicationResponseSchema>;
export type GatewayPublicationListResponse = z.infer<typeof GatewayPublicationListResponseSchema>;
export type GatewayErrorResponse = z.infer<typeof GatewayErrorResponseSchema>;
export type PublicPublicationResponse = z.infer<typeof PublicPublicationResponseSchema>;
