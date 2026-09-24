import type { Publication } from "@/domain/publication";
import { GatewayError } from "@/application/publication-gateway/errors";

export type GatewayRole =
  | "external-application"
  | "editor"
  | "publisher"
  | "admin"
  | "public-reader";

export const GATEWAY_ROLES: readonly GatewayRole[] = [
  "external-application",
  "editor",
  "publisher",
  "admin",
  "public-reader",
];

export type GatewayActor = {
  subjectId: string;
  roles: GatewayRole[];
  originatingApplication?: string;
};

export type GatewayAction =
  | "createDraft"
  | "list"
  | "retrieve"
  | "update"
  | "attachEvidence"
  | "transition"
  | "readPublic";

export interface PublicationAuthorizationPolicy {
  assertCan(action: GatewayAction, actor: GatewayActor | undefined, publication?: Publication): void;
}

function hasAnyRole(actor: GatewayActor | undefined, roles: readonly GatewayRole[]): actor is GatewayActor {
  return Boolean(actor?.roles.some((role) => roles.includes(role)));
}

function ownsExternalApplication(actor: GatewayActor, publication: Publication): boolean {
  return (
    actor.roles.includes("external-application") &&
    Boolean(actor.originatingApplication) &&
    actor.originatingApplication === publication.provenance.origin.originatingApplication
  );
}

export class RoleBasedPublicationAuthorizationPolicy implements PublicationAuthorizationPolicy {
  assertCan(action: GatewayAction, actor: GatewayActor | undefined, publication?: Publication): void {
    if (action === "readPublic") {
      return;
    }

    if (!actor) {
      throw new GatewayError("UNAUTHORIZED", "A gateway actor is required.");
    }

    if (actor.roles.includes("admin")) {
      return;
    }

    if (action === "createDraft" && hasAnyRole(actor, ["external-application", "editor"])) {
      return;
    }

    if (action === "list" && hasAnyRole(actor, ["editor", "publisher"])) {
      return;
    }

    if (!publication) {
      throw new GatewayError("FORBIDDEN", "The actor is not allowed to perform this action.");
    }

    if (action === "update" && hasAnyRole(actor, ["editor"])) {
      return;
    }

    if (action === "update" && ownsExternalApplication(actor, publication)) {
      return;
    }

    if (action === "retrieve") {
      if (hasAnyRole(actor, ["editor", "publisher"])) {
        return;
      }
      if (ownsExternalApplication(actor, publication)) {
        return;
      }
    }

    if (action === "attachEvidence") {
      if (hasAnyRole(actor, ["editor", "publisher"])) {
        return;
      }
      if (ownsExternalApplication(actor, publication) && publication.lifecycleState === "draft") {
        return;
      }
    }

    if (action === "transition" && hasAnyRole(actor, ["editor", "publisher"])) {
      return;
    }

    throw new GatewayError("FORBIDDEN", "The actor is not allowed to perform this action.");
  }
}