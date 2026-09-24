import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  canTransitionLifecycle,
  PublicationSchema,
  toPublicPublication,
  type EvidenceReference,
  type LifecycleState,
  type Publication,
} from "@/domain/publication";
import {
  AttachEvidenceRequestSchema,
  CreateDraftPublicationRequestSchema,
  GatewayPublicationListResponseSchema,
  GatewayPublicationResponseSchema,
  PublicPublicationResponseSchema,
  TransitionPublicationRequestSchema,
  UpdatePublicationRequestSchema,
  type CreateDraftPublicationRequest,
  type GatewayPublicationListResponse,
  type GatewayPublicationResponse,
  type PublicPublicationResponse,
} from "@/application/publication-gateway/dto";
import {
  RoleBasedPublicationAuthorizationPolicy,
  type GatewayActor,
  type PublicationAuthorizationPolicy,
} from "@/application/publication-gateway/authorization";
import { GatewayError, gatewayValidationError } from "@/application/publication-gateway/errors";
import type { AuditEvent } from "@/audit/events";
import type { EvidenceRegistry, RegisteredEvidence } from "@/evidence/registry";
import {
  RepositoryConcurrencyError,
  RepositoryIdempotencyConflictError,
  RepositoryPersistenceError,
  type PublicationRepository,
  type SavePublicationOptions,
} from "@/publications/repository";

export type GatewayRequestContext = {
  correlationId: string;
  requestId: string;
  idempotencyKey?: string;
};

type PublicationGatewayServiceOptions = {
  repository: PublicationRepository;
  evidenceRegistry?: EvidenceRegistry;
  authorization?: PublicationAuthorizationPolicy;
  idFactory?: () => string;
  now?: () => Date;
  editorialBaseUrl?: string;
  publicBaseUrl?: string;
};

type ParsedCreateDraft = CreateDraftPublicationRequest;
type PublicationPatch = Partial<
  Pick<
    Publication,
    | "slug"
    | "type"
    | "title"
    | "excerpt"
    | "body"
    | "publishedAt"
    | "readingTimeMinutes"
    | "tags"
    | "visibility"
    | "sources"
  >
>;

const PUBLIC_LIFECYCLE_STATES: readonly LifecycleState[] = ["published", "updated"];

function parseRequest<T>(
  parser: {
    safeParse(
      input: unknown,
    ): { success: true; data: T } | { success: false; error: z.ZodError };
  },
  input: unknown,
): T {
  const parsed = parser.safeParse(input);
  if (!parsed.success) {
    throw gatewayValidationError(parsed.error);
  }
  return parsed.data;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function actorIsExternalApplication(actor: GatewayActor | undefined): actor is GatewayActor {
  return Boolean(actor?.roles.includes("external-application"));
}

function cloneForRevision(
  publication: Publication,
  now: Date,
  summary: string,
): Publication["revision"] {
  return {
    version: publication.revision.version + 1,
    previousVersion: publication.revision.version,
    updatedAt: now.toISOString(),
    summary,
  };
}

function hasFilesystemLocator(locator: string | undefined): boolean {
  return Boolean(
    locator &&
      (/^[A-Za-z]:[\\/]/.test(locator) || locator.includes("\\") || locator.includes("/")),
  );
}

function defaultContext(idFactory: () => string): GatewayRequestContext {
  const requestId = idFactory();
  return { requestId, correlationId: requestId };
}

function requestHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export class PublicationGatewayService {
  private readonly repository: PublicationRepository;
  private readonly evidenceRegistry: EvidenceRegistry;
  private readonly authorization: PublicationAuthorizationPolicy;
  private readonly idFactory: () => string;
  private readonly now: () => Date;
  private readonly editorialBaseUrl: string;
  private readonly publicBaseUrl: string;

  constructor({
    repository,
    evidenceRegistry,
    authorization = new RoleBasedPublicationAuthorizationPolicy(),
    idFactory = randomUUID,
    now = () => new Date(),
    editorialBaseUrl = "/editor/publications",
    publicBaseUrl = "/publications",
  }: PublicationGatewayServiceOptions) {
    this.repository = repository;
    const repositoryRegistry = repository as PublicationRepository & Partial<EvidenceRegistry>;
    this.evidenceRegistry =
      evidenceRegistry ??
      (repositoryRegistry.getRegisteredEvidence && repositoryRegistry.register
        ? {
            getRegisteredEvidence: repositoryRegistry.getRegisteredEvidence.bind(repository),
            register: repositoryRegistry.register.bind(repository),
          }
        : {
            getRegisteredEvidence: async () => undefined,
            register: async (evidence) => evidence,
          });
    this.authorization = authorization;
    this.idFactory = idFactory;
    this.now = now;
    this.editorialBaseUrl = editorialBaseUrl;
    this.publicBaseUrl = publicBaseUrl;
  }

  async createDraft(
    input: unknown,
    actor: GatewayActor | undefined,
    context = defaultContext(this.idFactory),
  ): Promise<GatewayPublicationResponse> {
    const request = parseRequest(CreateDraftPublicationRequestSchema, input);
    this.authorization.assertCan("createDraft", actor);
    this.assertExternalApplicationMatchesOrigin(actor, request);
    const idempotency = await this.resolveIdempotency(request, actor, context);
    if (idempotency) {
      return this.response(idempotency, context);
    }

    const evidence = await this.resolveEvidence(request.evidenceIds, actor);
    const existing = await this.repository.findByOriginIdentity(request.origin);
    if (existing) {
      if (request.expectedVersion === undefined) {
        throw new GatewayError(
          "ORIGIN_CONFLICT",
          "Origin identity already exists; expectedVersion is required for an origin revision.",
          { publicationId: existing.id, currentVersion: existing.revision.version },
        );
      }
      return this.updateExistingDraftFromOrigin(
        existing,
        request,
        evidence,
        actor,
        context,
      );
    }
    if (request.expectedVersion !== undefined && request.expectedVersion !== 0) {
      throw new GatewayError("STALE_VERSION", "The publication version is stale.", {
        expectedVersion: request.expectedVersion,
        currentVersion: null,
      });
    }

    await this.assertSlugAvailable(request.slug);
    const now = this.now();
    const publication = this.validatePublication({
      id: this.idFactory(),
      slug: request.slug,
      type: request.type,
      lifecycleState: "draft",
      visibility: request.visibility,
      title: request.title,
      excerpt: request.excerpt,
      body: request.body,
      publishedAt: request.publishedAt ?? isoDate(now),
      readingTimeMinutes: request.readingTimeMinutes,
      tags: request.tags,
      revision: {
        version: 1,
        updatedAt: now.toISOString(),
        summary: "Draft created through publication gateway.",
      },
      provenance: {
        origin: request.origin,
        createdBy: request.createdBy,
        createdAt: now.toISOString(),
        verificationStatus: request.verificationStatus,
        internalNotes: request.internalNotes,
      },
      extensions: request.extensions ?? {},
      evidence: evidence.map(this.toEvidenceReference),
      sources: request.sources,
    });
    this.assertEvidencePolicy(publication.evidence, actor, publication);

    const saved = await this.persist(publication, {
      expectedVersion: 0,
      registeredEvidence: evidence,
      auditEvent: this.auditEvent(
        "publication.create",
        publication,
        actor,
        context,
        undefined,
      ),
      idempotency: context.idempotencyKey
        ? {
            actorScope: this.actorScope(actor),
            key: context.idempotencyKey,
            requestHash: requestHash(request),
            createdAt: now.toISOString(),
          }
        : undefined,
    });
    return this.response(saved, context);
  }

  async list(actor: GatewayActor | undefined): Promise<GatewayPublicationListResponse> {
    this.authorization.assertCan("list", actor);
    return GatewayPublicationListResponseSchema.parse({
      publications: await this.repository.list(),
    });
  }

  async getPublication(
    id: string,
    actor: GatewayActor | undefined,
    context = defaultContext(this.idFactory),
  ): Promise<GatewayPublicationResponse> {
    const publication = await this.requirePublication(id);
    this.authorization.assertCan("retrieve", actor, publication);
    return this.response(publication, context);
  }

  async update(
    id: string,
    input: unknown,
    actor: GatewayActor | undefined,
    context = defaultContext(this.idFactory),
  ): Promise<GatewayPublicationResponse> {
    const request = parseRequest(UpdatePublicationRequestSchema, input);
    const publication = await this.requirePublication(id);
    this.authorization.assertCan("update", actor, publication);
    this.assertExpectedVersion(request.expectedVersion, publication);
    this.assertExternalSynchronizationIsUnlocked(publication, actor);
    if (publication.lifecycleState !== "draft" && publication.lifecycleState !== "review") {
      throw new GatewayError(
        "CONFLICT",
        "Only draft or review publications can be edited directly.",
      );
    }
    if (request.slug && request.slug !== publication.slug) {
      await this.assertSlugAvailable(request.slug, publication.id);
    }

    const patch: PublicationPatch = {
      ...(request.slug !== undefined ? { slug: request.slug } : {}),
      ...(request.type !== undefined ? { type: request.type } : {}),
      ...(request.title !== undefined ? { title: request.title } : {}),
      ...(request.excerpt !== undefined ? { excerpt: request.excerpt } : {}),
      ...(request.body !== undefined ? { body: request.body } : {}),
      ...(request.publishedAt !== undefined ? { publishedAt: request.publishedAt } : {}),
      ...(request.readingTimeMinutes !== undefined
        ? { readingTimeMinutes: request.readingTimeMinutes }
        : {}),
      ...(request.tags !== undefined ? { tags: request.tags } : {}),
      ...(request.visibility !== undefined ? { visibility: request.visibility } : {}),
      ...(request.sources !== undefined ? { sources: request.sources } : {}),
    };
    const updated = this.validatePublication({
      ...publication,
      ...patch,
      revision: cloneForRevision(publication, this.now(), request.revisionSummary),
      provenance: {
        ...publication.provenance,
        verificationStatus:
          request.verificationStatus ?? publication.provenance.verificationStatus,
        internalNotes: request.internalNotes ?? publication.provenance.internalNotes,
      },
      extensions: request.extensions ?? publication.extensions,
    });
    const saved = await this.persist(updated, {
      expectedVersion: request.expectedVersion,
      auditEvent: this.auditEvent(
        "publication.update",
        updated,
        actor,
        context,
        publication.revision.version,
      ),
    });
    return this.response(saved, context);
  }

  async attachEvidence(
    id: string,
    input: unknown,
    actor: GatewayActor | undefined,
    context = defaultContext(this.idFactory),
  ): Promise<GatewayPublicationResponse> {
    const request = parseRequest(AttachEvidenceRequestSchema, input);
    const publication = await this.requirePublication(id);
    this.authorization.assertCan("attachEvidence", actor, publication);
    this.assertExpectedVersion(request.expectedVersion, publication);
    if (publication.lifecycleState === "published" || publication.lifecycleState === "updated") {
      throw new GatewayError(
        "CONFLICT",
        "Published publications require a new editorial revision before evidence can be attached.",
      );
    }
    const [registered] = await this.resolveEvidence([request.evidenceId], actor);
    if (!registered) {
      throw new GatewayError("EVIDENCE_NOT_REGISTERED", "Evidence is not registered.");
    }
    const evidence = this.toEvidenceReference(registered);
    this.assertEvidencePolicy([evidence], actor, publication);
    if (publication.evidence.some((candidate) => candidate.id === evidence.id)) {
      throw new GatewayError("CONFLICT", "Evidence is already associated.");
    }

    const updated = this.validatePublication({
      ...publication,
      evidence: [...publication.evidence, evidence],
      revision: cloneForRevision(publication, this.now(), request.revisionSummary),
    });
    const saved = await this.persist(updated, {
      expectedVersion: request.expectedVersion,
      registeredEvidence: [registered],
      auditEvent: this.auditEvent(
        "publication.evidence.attach",
        updated,
        actor,
        context,
        publication.revision.version,
      ),
    });
    return this.response(saved, context);
  }

  async transition(
    id: string,
    input: unknown,
    actor: GatewayActor | undefined,
    context = defaultContext(this.idFactory),
  ): Promise<GatewayPublicationResponse> {
    const request = parseRequest(TransitionPublicationRequestSchema, input);
    const publication = await this.requirePublication(id);
    this.authorization.assertCan("transition", actor, publication);
    this.assertExpectedVersion(request.expectedVersion, publication);
    if (!canTransitionLifecycle(publication.lifecycleState, request.to)) {
      throw new GatewayError(
        "INVALID_TRANSITION",
        `Cannot transition a publication from "${publication.lifecycleState}" to "${request.to}".`,
      );
    }
    if (
      (request.to === "published" || request.to === "updated") &&
      !(actor?.roles.includes("publisher") || actor?.roles.includes("admin"))
    ) {
      throw new GatewayError("FORBIDDEN", "Publishing requires a publisher or admin actor.");
    }
    const updated = this.validatePublication({
      ...publication,
      lifecycleState: request.to,
      revision: cloneForRevision(publication, this.now(), request.revisionSummary),
    });
    const saved = await this.persist(updated, {
      expectedVersion: request.expectedVersion,
      auditEvent: this.auditEvent(
        "publication.lifecycle.transition",
        updated,
        actor,
        context,
        publication.revision.version,
      ),
    });
    return this.response(saved, context);
  }

  async getPublicBySlug(
    slug: string,
    actor: GatewayActor | undefined,
  ): Promise<PublicPublicationResponse> {
    this.authorization.assertCan("readPublic", actor);
    const publication = await this.repository.findBySlug(slug);
    if (
      !publication ||
      publication.visibility !== "public" ||
      !PUBLIC_LIFECYCLE_STATES.includes(publication.lifecycleState)
    ) {
      throw new GatewayError("NOT_FOUND", "Publication not found.");
    }
    return PublicPublicationResponseSchema.parse({
      publication: toPublicPublication(publication),
    });
  }

  private async resolveIdempotency(
    request: ParsedCreateDraft,
    actor: GatewayActor | undefined,
    context: GatewayRequestContext,
  ): Promise<Publication | undefined> {
    if (!context.idempotencyKey) {
      return undefined;
    }
    const record = await this.repository.findIdempotency?.(
      this.actorScope(actor),
      context.idempotencyKey,
    );
    if (!record) {
      return undefined;
    }
    if (record.requestHash !== requestHash(request)) {
      throw new GatewayError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used with a different request.",
      );
    }
    return record.response;
  }

  private async resolveEvidence(
    ids: readonly string[],
    actor: GatewayActor | undefined,
  ): Promise<RegisteredEvidence[]> {
    const evidence: RegisteredEvidence[] = [];
    for (const id of ids) {
      const registered = await this.evidenceRegistry.getRegisteredEvidence(id);
      if (!registered || registered.status === "rejected") {
        throw new GatewayError(
          "EVIDENCE_NOT_REGISTERED",
          "Evidence must be registered and usable before association.",
          { evidenceId: id },
        );
      }
      if (
        actorIsExternalApplication(actor) &&
        registered.visibility !== "public" &&
        registered.visibility !== "citation-only"
      ) {
        throw new GatewayError(
          "EVIDENCE_POLICY_VIOLATION",
          "External applications can only associate public or citation-only evidence.",
        );
      }
      evidence.push(registered);
    }
    return evidence;
  }

  private readonly toEvidenceReference = (
    evidence: RegisteredEvidence,
  ): EvidenceReference => ({
    id: evidence.id,
    title: evidence.title,
    description: evidence.description,
    url: evidence.publicUrl,
    locator: evidence.locator,
    visibility: evidence.visibility,
    mediaType: evidence.mediaType,
    source: evidence.source,
    evidenceProvenance: evidence.provenance,
    checksum: evidence.checksum,
    processor: evidence.processor,
    status: evidence.status,
    citation: evidence.citation,
  });

  private response(
    publication: Publication,
    context: GatewayRequestContext,
  ): GatewayPublicationResponse {
    const publicUrl =
      publication.visibility === "public" &&
      PUBLIC_LIFECYCLE_STATES.includes(publication.lifecycleState)
        ? `${this.publicBaseUrl}/${publication.slug}`
        : undefined;
    return GatewayPublicationResponseSchema.parse({
      publication,
      originLink: {
        publicationId: publication.id,
        version: publication.revision.version,
        editorialUrl: `${this.editorialBaseUrl}/${publication.id}`,
        publicUrl,
        origin: publication.provenance.origin,
        lastSynchronizedAt: publication.revision.updatedAt,
      },
      correlationId: context.correlationId,
    });
  }

  private auditEvent(
    action: string,
    publication: Publication,
    actor: GatewayActor | undefined,
    context: GatewayRequestContext,
    previousVersion: number | undefined,
  ): AuditEvent {
    return {
      id: this.idFactory(),
      timestamp: this.now().toISOString(),
      actor: {
        subjectId: actor?.subjectId ?? "unknown",
        roles: actor?.roles ?? [],
        application: actor?.originatingApplication,
      },
      action,
      publicationId: publication.id,
      correlationId: context.correlationId,
      requestId: context.requestId,
      previousVersion,
      resultingVersion: publication.revision.version,
      outcome: "succeeded",
    };
  }

  private async persist(
    publication: Publication,
    options: SavePublicationOptions,
  ): Promise<Publication> {
    try {
      return await this.repository.save(publication, options);
    } catch (error) {
      if (error instanceof RepositoryConcurrencyError) {
        throw new GatewayError("STALE_VERSION", "The publication version is stale.", {
          expectedVersion: error.expectedVersion,
          currentVersion: error.actualVersion,
        });
      }
      if (error instanceof RepositoryIdempotencyConflictError) {
        throw new GatewayError(
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used with a different request.",
        );
      }
      if (error instanceof RepositoryPersistenceError) {
        throw new GatewayError(
          error.operation === "audit" ? "AUDIT_FAILURE" : "PERSISTENCE_FAILURE",
          "The publication could not be persisted.",
        );
      }
      throw error;
    }
  }

  private assertExpectedVersion(expectedVersion: number, publication: Publication): void {
    if (expectedVersion !== publication.revision.version) {
      throw new GatewayError("STALE_VERSION", "The publication version is stale.", {
        expectedVersion,
        currentVersion: publication.revision.version,
      });
    }
  }

  private assertExternalApplicationMatchesOrigin(
    actor: GatewayActor | undefined,
    request: ParsedCreateDraft,
  ): void {
    if (
      actorIsExternalApplication(actor) &&
      actor.originatingApplication !== request.origin.originatingApplication
    ) {
      throw new GatewayError(
        "FORBIDDEN",
        "External applications can only submit drafts for their own origin identity.",
      );
    }
  }

  private async updateExistingDraftFromOrigin(
    existing: Publication,
    request: ParsedCreateDraft,
    evidence: RegisteredEvidence[],
    actor: GatewayActor | undefined,
    context: GatewayRequestContext,
  ): Promise<GatewayPublicationResponse> {
    this.authorization.assertCan("createDraft", actor, existing);
    this.assertExpectedVersion(request.expectedVersion ?? 0, existing);
    this.assertExternalSynchronizationIsUnlocked(existing, actor);
    if (request.slug !== existing.slug) {
      await this.assertSlugAvailable(request.slug, existing.id);
    }
    const updated = this.validatePublication({
      ...existing,
      slug: request.slug,
      type: request.type,
      lifecycleState: "draft",
      visibility: request.visibility,
      title: request.title,
      excerpt: request.excerpt,
      body: request.body,
      publishedAt: request.publishedAt ?? existing.publishedAt,
      readingTimeMinutes: request.readingTimeMinutes,
      tags: request.tags,
      revision: cloneForRevision(
        existing,
        this.now(),
        "Draft synchronized from its registered origin.",
      ),
      provenance: {
        ...existing.provenance,
        createdBy: request.createdBy,
        verificationStatus: request.verificationStatus,
        internalNotes: request.internalNotes,
      },
      evidence: evidence.map(this.toEvidenceReference),
      sources: request.sources,
    });
    this.assertEvidencePolicy(updated.evidence, actor, updated);
    const saved = await this.persist(updated, {
      expectedVersion: request.expectedVersion ?? 0,
      registeredEvidence: evidence,
      auditEvent: this.auditEvent(
        "publication.origin.synchronize",
        updated,
        actor,
        context,
        existing.revision.version,
      ),
      idempotency: context.idempotencyKey
        ? {
            actorScope: this.actorScope(actor),
            key: context.idempotencyKey,
            requestHash: requestHash(request),
            createdAt: this.now().toISOString(),
          }
        : undefined,
    });
    return this.response(saved, context);
  }

  private actorScope(actor: GatewayActor | undefined): string {
    return `${actor?.originatingApplication ?? "-"}:${actor?.subjectId ?? "anonymous"}`;
  }

  private assertExternalSynchronizationIsUnlocked(
    publication: Publication,
    actor: GatewayActor | undefined,
  ): void {
    if (actorIsExternalApplication(actor) && publication.lifecycleState !== "draft") {
      throw new GatewayError(
        "EDITORIAL_LOCK",
        "External synchronization is only permitted while the publication remains a draft.",
        {
          publicationId: publication.id,
          currentVersion: publication.revision.version,
          currentLifecycleState: publication.lifecycleState,
        },
      );
    }
  }

  private async assertSlugAvailable(slug: string, currentId?: string): Promise<void> {
    const publication = await this.repository.findBySlug(slug);
    if (publication && publication.id !== currentId) {
      throw new GatewayError("CONFLICT", "A publication with this slug already exists.");
    }
  }

  private async requirePublication(id: string): Promise<Publication> {
    const publication = await this.repository.findById(id);
    if (!publication) {
      throw new GatewayError("NOT_FOUND", "Publication not found.");
    }
    return publication;
  }

  private validatePublication(publication: unknown): Publication {
    const parsed = PublicationSchema.safeParse(publication);
    if (!parsed.success) {
      throw gatewayValidationError(parsed.error);
    }
    return parsed.data;
  }

  private assertEvidencePolicy(
    evidence: readonly EvidenceReference[],
    actor: GatewayActor | undefined,
    publication: Publication,
  ): void {
    for (const item of evidence) {
      if (hasFilesystemLocator(item.locator)) {
        throw new GatewayError(
          "EVIDENCE_POLICY_VIOLATION",
          "Evidence associations must not reference filesystem paths.",
        );
      }
    }
    if (
      actorIsExternalApplication(actor) &&
      actor.originatingApplication !== publication.provenance.origin.originatingApplication
    ) {
      throw new GatewayError(
        "FORBIDDEN",
        "External applications can only modify publications from their own origin identity.",
      );
    }
  }
}
