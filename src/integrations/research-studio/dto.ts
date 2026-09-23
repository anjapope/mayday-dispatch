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
    version: z.number().int().positive(),
    state: LifecycleStateSchema,
    editorialUrl: z.string(),
    publicUrl: z.string().optional(),
    lastSyncedAt: z.string().datetime({ offset: true }),
    origin: PublicationOriginInputSchema,
  })
  .strict();

export type ResearchStudioIntegrationLink = z.infer<typeof ResearchStudioIntegrationLinkSchema>;

/** Projects a raw gateway response into the stable integration link contract. */
export function toIntegrationLink(
  response: GatewayPublicationResponse,
): ResearchStudioIntegrationLink {
  return ResearchStudioIntegrationLinkSchema.parse({
    dispatchPublicationId: response.originLink.publicationId,
    version: response.originLink.version,
    state: response.publication.lifecycleState,
    editorialUrl: response.originLink.editorialUrl,
    publicUrl: response.originLink.publicUrl,
    lastSyncedAt: response.originLink.lastSynchronizedAt,
    origin: response.originLink.origin,
  });
}