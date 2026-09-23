import { GatewayError } from "@/application/publication-gateway/errors";
import type { GatewayActor } from "@/application/publication-gateway/authorization";
import {
  RoleBasedEvidenceAuthorizationPolicy,
  type EvidenceAuthorizationPolicy,
} from "@/application/evidence-gateway/authorization";
import {
  RegisterEvidenceRequestSchema,
  type RegisterEvidenceRequest,
} from "@/application/evidence-gateway/dto";
import type { EvidenceRegistry, RegisteredEvidence } from "@/evidence/registry";

export type EvidenceRequestContext = {
  correlationId: string;
  requestId: string;
};

type EvidenceGatewayServiceOptions = {
  registry: EvidenceRegistry;
  authorization?: EvidenceAuthorizationPolicy;
  now?: () => Date;
};

/**
 * The Evidence Registry gateway is deliberately narrow: it registers
 * evidence metadata (typically produced by Mayday3 acquisition/processing)
 * and allows retrieval by id. It never associates evidence with a
 * publication -- that remains the publication gateway's
 * `attachEvidence` responsibility, keeping registration and association
 * as separate, independently authorizable operations.
 */
export class EvidenceGatewayService {
  private readonly registry: EvidenceRegistry;
  private readonly authorization: EvidenceAuthorizationPolicy;
  private readonly now: () => Date;

  constructor({ registry, authorization, now }: EvidenceGatewayServiceOptions) {
    this.registry = registry;
    this.authorization = authorization ?? new RoleBasedEvidenceAuthorizationPolicy();
    this.now = now ?? (() => new Date());
  }

  async register(
    actor: GatewayActor | undefined,
    request: RegisterEvidenceRequest,
    _context: EvidenceRequestContext,
  ): Promise<RegisteredEvidence> {
    this.authorization.assertCan("register", actor);

    const parseResult = RegisterEvidenceRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new GatewayError("VALIDATION_FAILED", "Evidence registration request failed validation.", {
        issues: parseResult.error.issues,
      });
    }

    const registeredAt = parseResult.data.registeredAt ?? this.now().toISOString();

    return this.registry.register({
      ...parseResult.data,
      registeredAt,
    });
  }

  async retrieve(
    actor: GatewayActor | undefined,
    id: string,
    _context: EvidenceRequestContext,
  ): Promise<RegisteredEvidence> {
    this.authorization.assertCan("retrieve", actor);

    const evidence = await this.registry.getRegisteredEvidence(id);
    if (!evidence) {
      throw new GatewayError("NOT_FOUND", "Registered evidence was not found.", { id });
    }
    return evidence;
  }
}