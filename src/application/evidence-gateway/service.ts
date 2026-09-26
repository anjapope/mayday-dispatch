import { GatewayError } from "@/application/publication-gateway/errors";
import type { GatewayActor } from "@/application/publication-gateway/authorization";
import {
  RoleBasedEvidenceAuthorizationPolicy,
  type EvidenceAuthorizationPolicy,
} from "@/application/evidence-gateway/authorization";
import {
  RegisterEvidenceRequestSchema,
  UpdateEvidenceRequestSchema,
  EvidenceSearchQuerySchema,
  type RegisterEvidenceRequest,
  type UpdateEvidenceRequest,
} from "@/application/evidence-gateway/dto";
import type { EvidenceDetail, EvidenceRegistry, RegisteredEvidence } from "@/evidence/registry";
import type { GatewayRequestContext } from "@/application/publication-gateway/service";
import { EvidenceConcurrencyError, RepositoryPersistenceError } from "@/publications/repository";

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
    context: GatewayRequestContext = this.defaultContext(),
  ): Promise<RegisteredEvidence> {
    this.authorization.assertCan("register", actor);

    const parseResult = RegisterEvidenceRequestSchema.safeParse(request);
    if (!parseResult.success) {
      throw new GatewayError("VALIDATION_FAILED", "Evidence registration request failed validation.", {
        issues: parseResult.error.issues,
      });
    }

    const registeredAt = parseResult.data.registeredAt ?? this.now().toISOString();
    const candidate = {
      ...parseResult.data,
      registeredAt,
      version: 1,
    };
    if (candidate.parentEvidenceId) {
      await this.requireEvidence(candidate.parentEvidenceId);
    }
    const replay = context.idempotencyKey
      ? await this.registry.findEvidenceIdempotency?.(this.actorScope(actor), context.idempotencyKey)
      : undefined;
    if (replay) {
      return replay;
    }
    const existing = await this.registry.getRegisteredEvidence(candidate.id);
    if (existing) {
      throw new GatewayError("CONFLICT", "Evidence identity already exists.");
    }
    try {
      return await this.registry.register(candidate, {
        audit: this.audit("evidence.register", candidate.id, actor, context, undefined, 1),
        idempotency: context.idempotencyKey
          ? {
              actorScope: this.actorScope(actor),
              key: context.idempotencyKey,
              requestHash: createHash("sha256").update(JSON.stringify(parseResult.data)).digest("hex"),
              createdAt: registeredAt,
            }
          : undefined,
      });
    } catch (error) {
      this.throwPersistenceError(error);
    }
  }

  async retrieve(
    actor: GatewayActor | undefined,
    id: string,
  ): Promise<RegisteredEvidence> {
    this.authorization.assertCan("retrieve", actor);

    const evidence = await this.registry.getRegisteredEvidence(id);
    if (!evidence) {
      throw new GatewayError("NOT_FOUND", "Registered evidence was not found.", { id });
    }
    return evidence;
  }

  async retrieveDetail(
    actor: GatewayActor | undefined,
    id: string,
  ): Promise<EvidenceDetail> {
    this.authorization.assertCan("retrieve", actor);
    const detail = await this.registry.getEvidenceDetail?.(id);
    if (!detail) {
      const evidence = await this.retrieve(actor, id);
      return {
        evidence,
        relatedEvidence: [],
        possibleDuplicates: [],
        revisionHistory: [],
        auditHistory: [],
        publicationUses: [],
      };
    }
    if (this.isEditorialActor(actor) || actor?.originatingApplication === "mayday3") {
      return detail;
    }
    if (detail.evidence.visibility !== "public" && detail.evidence.visibility !== "citation-only") {
      throw new GatewayError("FORBIDDEN", "The actor is not permitted to inspect this evidence.");
    }
    return {
      ...detail,
      relatedEvidence: detail.relatedEvidence,
      possibleDuplicates: [],
      auditHistory: [],
      revisionHistory: detail.revisionHistory,
      publicationUses: detail.publicationUses.filter((item) =>
        item.visibility === "public" && (item.lifecycleState === "published" || item.lifecycleState === "updated"),
      ),
    };
  }

  async search(
    actor: GatewayActor | undefined,
    input: unknown,
  ) {
    this.authorization.assertCan("search", actor);
    const query = EvidenceSearchQuerySchema.safeParse(input);
    if (!query.success) {
      throw new GatewayError("VALIDATION_FAILED", "Evidence search request failed validation.", {
        issues: query.error.issues,
      });
    }
    if (actor?.originatingApplication === "mayday3" && !query.data.checksum) {
      throw new GatewayError("FORBIDDEN", "Mayday3 evidence discovery is limited to checksum lookup.");
    }
    if (!this.registry.searchEvidence) {
      throw new GatewayError("PERSISTENCE_FAILURE", "Evidence discovery is not supported by this registry.");
    }
    const result = await this.registry.searchEvidence(query.data);
    const evidence = actor?.roles.includes("editor") || actor?.roles.includes("publisher") ||
      actor?.roles.includes("admin")
      ? result.evidence
      : result.evidence.filter((item) =>
        item.visibility === "public" || item.visibility === "citation-only",
      );
    return { evidence, nextCursor: result.nextCursor };
  }

  async update(
    id: string,
    actor: GatewayActor | undefined,
    request: UpdateEvidenceRequest,
    context: GatewayRequestContext = this.defaultContext(),
  ): Promise<RegisteredEvidence> {
    this.authorization.assertCan("update", actor);
    const parsed = UpdateEvidenceRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new GatewayError("VALIDATION_FAILED", "Evidence update request failed validation.", {
        issues: parsed.error.issues,
      });
    }
    const existing = await this.requireEvidence(id);
    if (existing.version !== parsed.data.expectedVersion) {
      throw new GatewayError("STALE_VERSION", "The evidence version is stale.", {
        expectedVersion: parsed.data.expectedVersion,
        currentVersion: existing.version,
      });
    }
    const { expectedVersion, ...patch } = parsed.data;
    void expectedVersion;
    const updated = {
      ...existing,
      ...patch,
      id,
      registeredAt: existing.registeredAt,
      version: existing.version + 1,
      processedAt: patch.status && patch.status !== existing.status
        ? this.now().toISOString()
        : existing.processedAt,
    };
    if (updated.parentEvidenceId) {
      await this.requireEvidence(updated.parentEvidenceId);
    }
    if (existing.visibility !== "public" && updated.visibility === "public") {
      throw new GatewayError(
        "FORBIDDEN",
        "Evidence visibility cannot be escalated to public through processing updates.",
      );
    }
    if (!this.registry.updateEvidence) {
      throw new GatewayError("PERSISTENCE_FAILURE", "Evidence updates are not supported by this registry.");
    }
    try {
      return await this.registry.updateEvidence(updated, existing.version, {
        audit: this.audit(
          patch.status && patch.status !== existing.status
            ? "evidence.processing.update"
            : "evidence.provenance.update",
          id,
          actor,
          context,
          existing.version,
          updated.version,
        ),
      });
    } catch (error) {
      this.throwPersistenceError(error);
    }
  }

  private async requireEvidence(id: string): Promise<RegisteredEvidence> {
    const evidence = await this.registry.getRegisteredEvidence(id);
    if (!evidence) {
      throw new GatewayError("NOT_FOUND", "Registered evidence was not found.", { id });
    }
    return evidence;
  }

  private actorScope(actor: GatewayActor | undefined): string {
    return `${actor?.originatingApplication ?? "-"}:${actor?.subjectId ?? "anonymous"}`;
  }

  private isEditorialActor(actor: GatewayActor | undefined): boolean {
    return Boolean(actor?.roles.some((role) => role === "editor" || role === "publisher" || role === "admin"));
  }

  private defaultContext(): GatewayRequestContext {
    const requestId = randomUUID();
    return { requestId, correlationId: requestId };
  }

  private audit(
    action: string,
    evidenceId: string,
    actor: GatewayActor | undefined,
    context: GatewayRequestContext,
    previousVersion?: number,
    resultingVersion?: number,
  ) {
    return {
      id: randomUUID(),
      timestamp: this.now().toISOString(),
      actorSubject: actor?.subjectId ?? "anonymous",
      actorApplication: actor?.originatingApplication,
      action,
      evidenceId,
      previousVersion,
      resultingVersion,
      outcome: "succeeded" as const,
      correlationId: context.correlationId,
      requestId: context.requestId,
    };
  }

  private throwPersistenceError(error: unknown): never {
    if (error instanceof EvidenceConcurrencyError) {
      throw new GatewayError("STALE_VERSION", "The evidence version is stale.", {
        expectedVersion: error.expectedVersion,
        currentVersion: error.actualVersion,
      });
    }
    if (error instanceof RepositoryPersistenceError) {
      if (error.operation === "duplicateEvidence") {
        throw new GatewayError("CONFLICT", "Evidence identity already exists.");
      }
      if (error.operation === "parentEvidence") {
        throw new GatewayError("NOT_FOUND", "Parent evidence was not found.");
      }
      throw new GatewayError("PERSISTENCE_FAILURE", "Evidence could not be persisted.");
    }
    throw error;
  }
}
import { createHash, randomUUID } from "node:crypto";