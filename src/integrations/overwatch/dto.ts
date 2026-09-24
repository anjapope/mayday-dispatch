import { z } from "zod";
import {
  GatewayPublicationResponseSchema,
  PublicationOriginInputSchema,
  type GatewayPublicationResponse,
} from "@/application/publication-gateway/dto";
import { LifecycleStateSchema } from "@/domain/publication";

export const OverwatchAssessmentMetadataSchema = z
  .object({
    confidenceLevel: z.string().trim().min(1).optional(),
    assessmentDate: z.string().date().optional(),
    sourceCount: z.number().int().nonnegative().optional(),
    corroborationStatus: z.string().trim().min(1).optional(),
    collectionWindow: z.string().trim().min(1).optional(),
    geographicScope: z.string().trim().min(1).optional(),
    temporalScope: z.string().trim().min(1).optional(),
    analyticCaveats: z.array(z.string().trim().min(1)).optional(),
    methodologyNote: z.string().trim().min(1).optional(),
    confidenceRationale: z.string().trim().min(1).optional(),
  })
  .strict();

export type OverwatchAssessmentMetadata = z.infer<typeof OverwatchAssessmentMetadataSchema>;

export const OverwatchPublicationInputSchema = z
  .object({
    overwatchObjectId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    body: z.array(z.string().trim().min(1)).min(1),
    publicationType: z.string().trim().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tags: z.array(z.string().trim().min(1)).default([]),
    visibility: z.enum(["private", "internal", "citation-only", "public"]).default("internal"),
    readingTimeMinutes: z.number().int().positive(),
    citations: z.array(z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1),
      authors: z.array(z.string().trim().min(1)).min(1),
      publisher: z.string().trim().min(1).optional(),
      publishedAt: z.string().date().optional(),
      url: z.string().url().optional(),
      doi: z.string().optional(),
    })).default([]),
    evidenceIds: z.array(z.string().uuid()).default([]),
    assessment: OverwatchAssessmentMetadataSchema.optional(),
    methodology: z.string().trim().min(1).optional(),
    provenanceNote: z.string().trim().min(1).optional(),
    seriesId: z.string().trim().min(1).optional(),
    previousPublicationId: z.string().uuid().optional(),
    reportingPeriod: z.string().trim().min(1).optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export type OverwatchPublicationInput = z.input<typeof OverwatchPublicationInputSchema>;

export const OverwatchIntegrationLinkSchema = z.object({
  dispatchPublicationId: z.string().uuid(),
  dispatchVersion: z.number().int().positive(),
  dispatchState: LifecycleStateSchema,
  dispatchEditorialUrl: z.string(),
  dispatchPublicUrl: z.string().optional(),
  dispatchLastSyncedAt: z.string().datetime({ offset: true }),
  dispatchOriginIdentity: PublicationOriginInputSchema,
  seriesId: z.string().optional(),
  reportingPeriod: z.string().optional(),
}).strict();

export type OverwatchIntegrationLink = z.infer<typeof OverwatchIntegrationLinkSchema>;

export function toIntegrationLink(
  response: GatewayPublicationResponse,
  input?: Pick<OverwatchPublicationInput, "seriesId" | "reportingPeriod">,
): OverwatchIntegrationLink {
  const parsed = GatewayPublicationResponseSchema.parse(response);
  return OverwatchIntegrationLinkSchema.parse({
    dispatchPublicationId: parsed.originLink.publicationId,
    dispatchVersion: parsed.originLink.version,
    dispatchState: parsed.publication.lifecycleState,
    dispatchEditorialUrl: parsed.originLink.editorialUrl,
    dispatchPublicUrl: parsed.originLink.publicUrl,
    dispatchLastSyncedAt: parsed.originLink.lastSynchronizedAt,
    dispatchOriginIdentity: parsed.originLink.origin,
    seriesId: input?.seriesId,
    reportingPeriod: input?.reportingPeriod,
  });
}
