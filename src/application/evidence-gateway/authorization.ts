import type { GatewayActor } from "@/application/publication-gateway/authorization";
import { GatewayError } from "@/application/publication-gateway/errors";

export type EvidenceGatewayAction = "register" | "retrieve" | "update";

export interface EvidenceAuthorizationPolicy {
  assertCan(action: EvidenceGatewayAction, actor: GatewayActor | undefined): void;
}

/**
 * Registration is restricted to the applications and editorial roles
 * permitted to introduce new registered evidence (Mayday3-style ingestion
 * services, editors, publishers). Retrieval requires any authenticated
 * actor -- this endpoint is a controlled integration surface, not a public
 * one; the public disclosure boundary remains `getPublicBySlug`'s
 * evidence projection.
 */
export class RoleBasedEvidenceAuthorizationPolicy implements EvidenceAuthorizationPolicy {
  assertCan(action: EvidenceGatewayAction, actor: GatewayActor | undefined): void {
    if (!actor) {
      throw new GatewayError("UNAUTHORIZED", "A gateway actor is required.");
    }
    if (actor.roles.includes("admin")) {
      return;
    }
    if (
      (action === "register" || action === "update") &&
      actor.roles.some((role) => role === "editor" || role === "publisher" || role === "external-application")
    ) {
      return;
    }
    if (action === "retrieve" && actor.roles.some((role) => role !== "public-reader")) {
      return;
    }
    throw new GatewayError("FORBIDDEN", "The actor is not allowed to perform this action.");
  }
}