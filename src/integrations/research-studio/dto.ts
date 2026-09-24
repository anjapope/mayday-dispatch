import { z } from "zod";
import { LifecycleStateSchema } from "@/domain/publication";
import {
  PublicationOriginInputSchema,
  type GatewayPublicationResponse,
} from "@/application/publication-gateway/dto";

/**
 * The Research Studio integration link/contract DTO. This is the stable,
 * external-facing shape Research Studio (or any other origin application)
 * should persist alongside its own record to track a linked Dispatch
 * publication -- distinct from Dispatch's internal `Publication` domain
 * shape, which may evolve independently. See
 * `docs/research-studio-integration.md`.
 */
export const ResearchStudioIntegrationLinkSchema = z
  .object({
    dispatchPublicationId: z.string().uuid(),
    dispatchVersion: z.number().int().positive(),
    dispatchState: LifecycleStateSchema,
    dispatchEditorialUrl: z.string(),
    dispatchPublicUrl: z.string().optional(),
    dispatchLastSyncedAt: z.string().datetime({ offset: true }),
    dispatchOriginIdentity: PublicationOriginInputSchema,
  })
  .strict();

export type ResearchStudioIntegrationLink = z.infer<typeof ResearchStudioIntegrationLinkSchema>;

/** Projects a raw gateway response into the stable integration link contract. */
export function toIntegrationLink(
  response: GatewayPublicationResponse,
): ResearchStudioIntegrationLink {
  return ResearchStudioIntegrationLinkSchema.parse({
    dispatchPublicationId: response.originLink.publicationId,
    dispatchVersion: response.originLink.version,
    dispatchState: response.publication.lifecycleState,
    dispatchEditorialUrl: response.originLink.editorialUrl,
    dispatchPublicUrl: response.originLink.publicUrl,
    dispatchLastSyncedAt: response.originLink.lastSynchronizedAt,
    dispatchOriginIdentity: response.originLink.origin,
  });
}