import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AuditEventSchema, type AuditEvent } from "@/audit/events";
import {
  PublicationSchema,
  toPublicPublication,
  type Publication,
  type PublicPublication,
} from "@/domain/publication";
import {
  RegisteredEvidenceSchema,
  type EvidenceRegistry,
  type RegisteredEvidence,
} from "@/evidence/registry";
import { getMigrationStatus, runMigrations, type MigrationStatus } from "@/persistence/migrations";

export type OriginIdentity = Pick<
  Publication["provenance"]["origin"],
  "originatingApplication" | "originatingProject" | "stableObjectId"
>;

export type IdempotencyRecord = {
  actorScope: string;
  key: string;
  requestHash: string;
  publicationId: string;
  resultingVersion: number;
  response: Publication;
  createdAt: string;
};

export type SavePublicationOptions = {
  expectedVersion: number;
  auditEvent: AuditEvent;
  registeredEvidence?: readonly RegisteredEvidence[];
  idempotency?: Omit<IdempotencyRecord, "publicationId" | "resultingVersion" | "response">;
};

export class RepositoryConcurrencyError extends Error {
  constructor(readonly expectedVersion: number, readonly actualVersion: number | undefined) {
    super("Publication version does not match the persisted version.");
    this.name = "RepositoryConcurrencyError";
  }
}

export class RepositoryIdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was already used with a different request.");
    this.name = "RepositoryIdempotencyConflictError";
  }
}

export class RepositoryPersistenceError extends Error {
  constructor(readonly operation: string, options?: ErrorOptions) {
    super("Publication persistence failed.", options);
    this.name = "RepositoryPersistenceError";
  }
}

export interface PublicationRepository {
  list(): Promise<Publication[]>;
  findById(id: string): Promise<Publication | undefined>;
  findBySlug(slug: string): Promise<Publication | undefined>;
  findByOriginIdentity(origin: OriginIdentity): Promise<Publication | undefined>;
  findIdempotency?(
    actorScope: string,
    key: string,
  ): Promise<IdempotencyRecord | undefined>;
  save(publication: Publication, options: SavePublicationOptions): Promise<Publication>;
  checkHealth?(): Promise<RepositoryHealth>;
}

export type RepositoryHealth = {
  databaseReachable: boolean;
  migrations: MigrationStatus;
};

function clonePublication(publication: Publication): Publication {
  return structuredClone(publication);
}

function originMatches(publication: Publication, origin: OriginIdentity): boolean {
  const candidate = publication.provenance.origin;
  return (
    candidate.originatingApplication === origin.originatingApplication &&
    candidate.originatingProject === origin.originatingProject &&
    candidate.stableObjectId === origin.stableObjectId
  );
}

export class InMemoryPublicationRepository implements PublicationRepository {
  private readonly publications = new Map<string, Publication>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  readonly auditEvents: AuditEvent[] = [];

  constructor(fixtures: readonly Publication[] = []) {
    for (const publication of fixtures) {
      this.publications.set(publication.id, clonePublication(publication));
    }
  }

  async list(): Promise<Publication[]> {
    return Array.from(this.publications.values()).map(clonePublication);
  }

  async findById(id: string): Promise<Publication | undefined> {
    const publication = this.publications.get(id);
    return publication ? clonePublication(publication) : undefined;
  }

  async findBySlug(slug: string): Promise<Publication | undefined> {
    const publication = Array.from(this.publications.values()).find(
      (candidate) => candidate.slug === slug,
    );
    return publication ? clonePublication(publication) : undefined;
  }

  async findByOriginIdentity(origin: OriginIdentity): Promise<Publication | undefined> {
    const publication = Array.from(this.publications.values()).find((candidate) =>
      originMatches(candidate, origin),
    );
    return publication ? clonePublication(publication) : undefined;
  }

  async findIdempotency(actorScope: string, key: string): Promise<IdempotencyRecord | undefined> {
    const record = this.idempotency.get(`${actorScope}:${key}`);
    return record ? structuredClone(record) : undefined;
  }

  async save(publication: Publication, options: SavePublicationOptions): Promise<Publication> {
    const parsed = PublicationSchema.parse(publication);
    const existing = this.publications.get(parsed.id);
    const actualVersion = existing?.revision.version;
    if (
      (options.expectedVersion === 0 && existing) ||
      (options.expectedVersion !== 0 && actualVersion !== options.expectedVersion)
    ) {
      throw new RepositoryConcurrencyError(options.expectedVersion, actualVersion);
    }

    const auditEvent = AuditEventSchema.parse(options.auditEvent);
    if (options.idempotency) {
      const storageKey = `${options.idempotency.actorScope}:${options.idempotency.key}`;
      const existingKey = this.idempotency.get(storageKey);
      if (existingKey && existingKey.requestHash !== options.idempotency.requestHash) {
        throw new RepositoryIdempotencyConflictError();
      }
      this.idempotency.set(storageKey, {
        ...options.idempotency,
        publicationId: parsed.id,
        resultingVersion: parsed.revision.version,
        response: clonePublication(parsed),
      });
    }
    this.publications.set(parsed.id, clonePublication(parsed));
    this.auditEvents.push(structuredClone(auditEvent));
    return clonePublication(parsed);
  }

  async checkHealth(): Promise<RepositoryHealth> {
    return {
      databaseReachable: true,
      migrations: { appliedCount: 0, availableCount: 0, upToDate: true },
    };
  }
}

type SqliteRow = Record<string, unknown>;

export class SqlitePublicationRepository implements PublicationRepository, EvidenceRegistry {
  readonly database: DatabaseSync;

  constructor(databasePath: string, options: { migrate?: boolean } = {}) {
    const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);
    if (resolvedPath !== ":memory:") {
      mkdirSync(dirname(resolvedPath), { recursive: true });
    }
    this.database = new DatabaseSync(resolvedPath);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (options.migrate !== false) {
      runMigrations(this.database);
    }
  }

  close(): void {
    this.database.close();
  }

  /**
   * Reports database reachability and migration readiness only; never
   * exposes the database file path or any other configuration detail.
   */
  async checkHealth(): Promise<RepositoryHealth> {
    let databaseReachable = false;
    try {
      this.database.prepare("SELECT 1").get();
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }

    return {
      databaseReachable,
      migrations: getMigrationStatus(this.database),
    };
  }

  async list(): Promise<Publication[]> {
    return this.database
      .prepare("SELECT id FROM publications ORDER BY created_at, id")
      .all()
      .map((row) => this.readPublication(String(row.id)));
  }

  async findById(id: string): Promise<Publication | undefined> {
    const row = this.database.prepare("SELECT id FROM publications WHERE id = ?").get(id);
    return row ? this.readPublication(String(row.id)) : undefined;
  }

  async findBySlug(slug: string): Promise<Publication | undefined> {
    const row = this.database.prepare("SELECT id FROM publications WHERE slug = ?").get(slug);
    return row ? this.readPublication(String(row.id)) : undefined;
  }

  async findByOriginIdentity(origin: OriginIdentity): Promise<Publication | undefined> {
    const row = this.database
      .prepare(`
        SELECT publication_id FROM origins
        WHERE originating_application = ?
          AND originating_project = ?
          AND stable_object_id = ?
      `)
      .get(origin.originatingApplication, origin.originatingProject, origin.stableObjectId);
    return row ? this.readPublication(String(row.publication_id)) : undefined;
  }

  async findIdempotency(actorScope: string, key: string): Promise<IdempotencyRecord | undefined> {
    const row = this.database
      .prepare("SELECT * FROM idempotency_keys WHERE actor_scope = ? AND idempotency_key = ?")
      .get(actorScope, key) as SqliteRow | undefined;
    if (!row) {
      return undefined;
    }
    return {
      actorScope: String(row.actor_scope),
      key: String(row.idempotency_key),
      requestHash: String(row.request_hash),
      publicationId: String(row.publication_id),
      resultingVersion: Number(row.resulting_version),
      response: PublicationSchema.parse(JSON.parse(String(row.response_json))),
      createdAt: String(row.created_at),
    };
  }

  async register(evidence: RegisteredEvidence): Promise<RegisteredEvidence> {
    const item = RegisteredEvidenceSchema.parse(evidence);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (item.citation) {
        this.upsertCitation(item.citation);
      }
      this.database
        .prepare(`
          INSERT INTO evidence_references (
            id, title, description, media_type, source, provenance, visibility, checksum,
            processor, status, public_url, locator, citation_id, registered_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          item.id,
          item.title,
          item.description ?? null,
          item.mediaType,
          item.source,
          item.provenance,
          item.visibility,
          item.checksum.toLowerCase(),
          item.processor ?? null,
          item.status,
          item.publicUrl ?? null,
          item.locator ?? null,
          item.citation?.id ?? null,
          item.registeredAt,
        );
      this.database.exec("COMMIT");
      return structuredClone(item);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw new RepositoryPersistenceError("registerEvidence", { cause: error });
    }
  }

  async getRegisteredEvidence(id: string): Promise<RegisteredEvidence | undefined> {
    const row = this.database
      .prepare("SELECT * FROM evidence_references WHERE id = ?")
      .get(id) as SqliteRow | undefined;
    if (!row) {
      return undefined;
    }
    const citation = row.citation_id ? this.readCitation(String(row.citation_id)) : undefined;
    return RegisteredEvidenceSchema.parse({
      id: String(row.id),
      title: String(row.title),
      description: row.description ? String(row.description) : undefined,
      mediaType: String(row.media_type),
      source: String(row.source),
      provenance: String(row.provenance),
      visibility: String(row.visibility),
      checksum: String(row.checksum),
      processor: row.processor ? String(row.processor) : undefined,
      status: String(row.status),
      publicUrl: row.public_url ? String(row.public_url) : undefined,
      locator: row.locator ? String(row.locator) : undefined,
      citation,
      registeredAt: String(row.registered_at),
    });
  }

  async save(publication: Publication, options: SavePublicationOptions): Promise<Publication> {
    const parsed = PublicationSchema.parse(publication);
    const audit = AuditEventSchema.parse(options.auditEvent);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.database
        .prepare("SELECT current_version, lifecycle_state FROM publications WHERE id = ?")
        .get(parsed.id) as SqliteRow | undefined;
      const actualVersion = current ? Number(current.current_version) : undefined;
      if (
        (options.expectedVersion === 0 && current) ||
        (options.expectedVersion !== 0 && actualVersion !== options.expectedVersion)
      ) {
        throw new RepositoryConcurrencyError(options.expectedVersion, actualVersion);
      }

      if (options.idempotency) {
        const existingKey = this.database
          .prepare("SELECT request_hash FROM idempotency_keys WHERE actor_scope = ? AND idempotency_key = ?")
          .get(options.idempotency.actorScope, options.idempotency.key) as SqliteRow | undefined;
        if (existingKey && String(existingKey.request_hash) !== options.idempotency.requestHash) {
          throw new RepositoryIdempotencyConflictError();
        }
      }

      for (const evidence of options.registeredEvidence ?? []) {
        const exists = this.database
          .prepare("SELECT 1 FROM evidence_references WHERE id = ?")
          .get(evidence.id);
        if (!exists) {
          throw new RepositoryPersistenceError("associateUnregisteredEvidence");
        }
      }

      this.writePublication(parsed, current === undefined);
      this.writeRelations(parsed);
      this.writeRevision(parsed);

      if (!current || String(current.lifecycle_state) !== parsed.lifecycleState) {
        this.database
          .prepare(`
            INSERT INTO lifecycle_history
              (publication_id, from_state, to_state, version, changed_at)
            VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            parsed.id,
            current ? String(current.lifecycle_state) : null,
            parsed.lifecycleState,
            parsed.revision.version,
            parsed.revision.updatedAt,
          );
      }

      this.writeAudit(audit);
      if (options.idempotency) {
        this.database
          .prepare(`
            INSERT INTO idempotency_keys (
              actor_scope, idempotency_key, request_hash, publication_id,
              resulting_version, response_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            options.idempotency.actorScope,
            options.idempotency.key,
            options.idempotency.requestHash,
            parsed.id,
            parsed.revision.version,
            JSON.stringify(parsed),
            options.idempotency.createdAt,
          );
      }
      this.database.exec("COMMIT");
      return clonePublication(parsed);
    } catch (error) {
      this.database.exec("ROLLBACK");
      if (
        error instanceof RepositoryConcurrencyError ||
        error instanceof RepositoryIdempotencyConflictError ||
        error instanceof RepositoryPersistenceError
      ) {
        throw error;
      }
      throw new RepositoryPersistenceError("save", { cause: error });
    }
  }

  private readPublication(id: string): Publication {
    const row = this.database
      .prepare(`
        SELECT p.*, o.kind, o.label, o.url AS origin_url, o.originating_application,
          o.originating_project, o.stable_object_id, o.last_synchronized_at,
          r.previous_version, r.updated_at, r.summary
        FROM publications p
        JOIN origins o ON o.publication_id = p.id
        JOIN revisions r ON r.publication_id = p.id AND r.version = p.current_version
        WHERE p.id = ?
      `)
      .get(id) as SqliteRow;
    const evidenceRows = this.database
      .prepare(`
        SELECT e.* FROM evidence_references e
        JOIN publication_evidence pe ON pe.evidence_id = e.id
        WHERE pe.publication_id = ? ORDER BY pe.associated_at, e.id
      `)
      .all(id) as SqliteRow[];
    const sourceRows = this.database
      .prepare(`
        SELECT c.* FROM citations c
        JOIN publication_citations pc ON pc.citation_id = c.id
        WHERE pc.publication_id = ? ORDER BY pc.ordinal
      `)
      .all(id) as SqliteRow[];

    return PublicationSchema.parse({
      id: String(row.id),
      slug: String(row.slug),
      type: String(row.type),
      lifecycleState: String(row.lifecycle_state),
      visibility: String(row.visibility),
      title: String(row.title),
      excerpt: String(row.excerpt),
      body: JSON.parse(String(row.body_json)),
      publishedAt: String(row.published_at),
      readingTimeMinutes: Number(row.reading_time_minutes),
      tags: JSON.parse(String(row.tags_json)),
      revision: {
        version: Number(row.current_version),
        previousVersion: row.previous_version === null ? undefined : Number(row.previous_version),
        updatedAt: String(row.updated_at),
        summary: String(row.summary),
      },
      provenance: {
        origin: {
          kind: String(row.kind),
          label: String(row.label),
          url: row.origin_url ? String(row.origin_url) : undefined,
          originatingApplication: String(row.originating_application),
          originatingProject: String(row.originating_project),
          stableObjectId: String(row.stable_object_id),
        },
        createdBy: String(row.created_by),
        createdAt: String(row.created_at),
        verificationStatus: String(row.verification_status),
        internalNotes: row.internal_notes ? String(row.internal_notes) : undefined,
      },
      extensions: row.extensions_json
        ? JSON.parse(String(row.extensions_json))
        : {},
      evidence: evidenceRows.map((evidence) => ({
        id: String(evidence.id),
        title: String(evidence.title),
        description: evidence.description ? String(evidence.description) : undefined,
        mediaType: String(evidence.media_type),
        source: String(evidence.source),
        evidenceProvenance: String(evidence.provenance),
        visibility: String(evidence.visibility),
        checksum: String(evidence.checksum),
        processor: evidence.processor ? String(evidence.processor) : undefined,
        status: String(evidence.status),
        url: evidence.public_url ? String(evidence.public_url) : undefined,
        locator: evidence.locator ? String(evidence.locator) : undefined,
        citation: evidence.citation_id
          ? this.readCitation(String(evidence.citation_id))
          : undefined,
      })),
      sources: sourceRows.map((source) => this.citationFromRow(source)),
    });
  }

  private writePublication(publication: Publication, insert: boolean): void {
    const values = [
      publication.slug,
      publication.type,
      publication.lifecycleState,
      publication.visibility,
      publication.title,
      publication.excerpt,
      JSON.stringify(publication.body),
      publication.publishedAt,
      publication.readingTimeMinutes,
      JSON.stringify(publication.tags),
      publication.revision.version,
      publication.provenance.createdBy,
      publication.provenance.createdAt,
      publication.provenance.verificationStatus,
      publication.provenance.internalNotes ?? null,
      JSON.stringify(publication.extensions),
    ] as const;

    if (insert) {
      this.database
        .prepare(`
          INSERT INTO publications (
            slug, type, lifecycle_state, visibility, title, excerpt, body_json,
            published_at, reading_time_minutes, tags_json, current_version,
            created_by, created_at, verification_status, internal_notes, extensions_json, id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(...values, publication.id);
      this.database
        .prepare(`
          INSERT INTO origins (
            publication_id, kind, label, url, originating_application,
            originating_project, stable_object_id, last_synchronized_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          publication.id,
          publication.provenance.origin.kind,
          publication.provenance.origin.label,
          publication.provenance.origin.url ?? null,
          publication.provenance.origin.originatingApplication,
          publication.provenance.origin.originatingProject,
          publication.provenance.origin.stableObjectId,
          publication.revision.updatedAt,
        );
      return;
    }

    this.database
      .prepare(`
        UPDATE publications SET
          slug = ?, type = ?, lifecycle_state = ?, visibility = ?, title = ?,
          excerpt = ?, body_json = ?, published_at = ?, reading_time_minutes = ?,
          tags_json = ?, current_version = ?, created_by = ?, created_at = ?,
          verification_status = ?, internal_notes = ?, extensions_json = ?
        WHERE id = ?
      `)
      .run(...values, publication.id);
    this.database
      .prepare(`
        UPDATE origins SET kind = ?, label = ?, url = ?, originating_application = ?,
          originating_project = ?, stable_object_id = ?, last_synchronized_at = ?
        WHERE publication_id = ?
      `)
      .run(
        publication.provenance.origin.kind,
        publication.provenance.origin.label,
        publication.provenance.origin.url ?? null,
        publication.provenance.origin.originatingApplication,
        publication.provenance.origin.originatingProject,
        publication.provenance.origin.stableObjectId,
        publication.revision.updatedAt,
        publication.id,
      );
  }

  private writeRelations(publication: Publication): void {
    this.database.prepare("DELETE FROM publication_citations WHERE publication_id = ?").run(publication.id);
    publication.sources.forEach((citation, ordinal) => {
      this.upsertCitation(citation);
      this.database
        .prepare("INSERT INTO publication_citations (publication_id, citation_id, ordinal) VALUES (?, ?, ?)")
        .run(publication.id, citation.id, ordinal);
    });

    const existingEvidence = new Set(
      this.database
        .prepare("SELECT evidence_id FROM publication_evidence WHERE publication_id = ?")
        .all(publication.id)
        .map((row) => String(row.evidence_id)),
    );
    for (const evidence of publication.evidence) {
      if (!existingEvidence.has(evidence.id)) {
        this.database
          .prepare(`
            INSERT INTO publication_evidence
              (publication_id, evidence_id, associated_version, associated_at)
            VALUES (?, ?, ?, ?)
          `)
          .run(publication.id, evidence.id, publication.revision.version, publication.revision.updatedAt);
      }
    }
  }

  private writeRevision(publication: Publication): void {
    this.database
      .prepare(`
        INSERT INTO revisions (
          publication_id, version, previous_version, updated_at, summary, snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        publication.id,
        publication.revision.version,
        publication.revision.previousVersion ?? null,
        publication.revision.updatedAt,
        publication.revision.summary,
        JSON.stringify(publication),
      );
  }

  private writeAudit(event: AuditEvent): void {
    try {
      this.database
        .prepare(`
          INSERT INTO audit_events (
            id, timestamp, actor_subject, actor_roles_json, actor_application, action,
            publication_id, correlation_id, request_id, previous_version,
            resulting_version, outcome, reason, error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          event.id,
          event.timestamp,
          event.actor.subjectId,
          JSON.stringify(event.actor.roles),
          event.actor.application ?? null,
          event.action,
          event.publicationId ?? null,
          event.correlationId,
          event.requestId,
          event.previousVersion ?? null,
          event.resultingVersion ?? null,
          event.outcome,
          event.reason ?? null,
          event.errorCode ?? null,
        );
    } catch (error) {
      throw new RepositoryPersistenceError("audit", { cause: error });
    }
  }

  private upsertCitation(citation: Publication["sources"][number]): void {
    this.database
      .prepare(`
        INSERT INTO citations (id, title, authors_json, publisher, published_at, url, doi)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          authors_json = excluded.authors_json,
          publisher = excluded.publisher,
          published_at = excluded.published_at,
          url = excluded.url,
          doi = excluded.doi
      `)
      .run(
        citation.id,
        citation.title,
        JSON.stringify(citation.authors),
        citation.publisher ?? null,
        citation.publishedAt ?? null,
        citation.url ?? null,
        citation.doi ?? null,
      );
  }

  private readCitation(id: string): Publication["sources"][number] {
    const row = this.database.prepare("SELECT * FROM citations WHERE id = ?").get(id) as SqliteRow;
    return this.citationFromRow(row);
  }

  private citationFromRow(row: SqliteRow): Publication["sources"][number] {
    return {
      id: String(row.id),
      title: String(row.title),
      authors: JSON.parse(String(row.authors_json)) as string[],
      publisher: row.publisher ? String(row.publisher) : undefined,
      publishedAt: row.published_at ? String(row.published_at) : undefined,
      url: row.url ? String(row.url) : undefined,
      doi: row.doi ? String(row.doi) : undefined,
    };
  }
}

const defaultDatabasePath =
  process.env.MAYDAY_DATABASE_PATH ?? resolve(process.cwd(), "data", "mayday-dispatch.sqlite");
let singletonRepository: PublicationRepository | undefined;

function isPubliclyReadable(publication: Publication): boolean {
  return (
    publication.visibility === "public" &&
    (publication.lifecycleState === "published" || publication.lifecycleState === "updated")
  );
}

export function getPublicationRepository(): PublicationRepository {
  singletonRepository ??= new SqlitePublicationRepository(defaultDatabasePath, {
    migrate: false,
  });
  return singletonRepository;
}

export async function listPublications(): Promise<PublicPublication[]> {
  const publications = await getPublicationRepository().list();
  return publications.filter(isPubliclyReadable).map(toPublicPublication);
}

export async function getPublicationBySlug(slug: string): Promise<PublicPublication | undefined> {
  const publication = await getPublicationRepository().findBySlug(slug);
  return publication && isPubliclyReadable(publication)
    ? toPublicPublication(publication)
    : undefined;
}
