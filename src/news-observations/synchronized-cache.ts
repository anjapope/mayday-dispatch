import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  normalizeNewsObservation,
  toPublicNewsObservation,
  type NewsObservation,
  type PublicNewsObservation,
} from "@/news-observations/contract";
import { LiveIntelligenceObservationProvider } from "@/news-observations/live-consumer";
import type {
  NewsObservationProvider,
  ObservationPage,
  ObservationProviderCapabilities,
  ObservationProviderStatus,
  ObservationQuery,
} from "@/news-observations/provider";

export type SynchronizationBounds = {
  pageSize: number;
  maximumPages: number;
  maximumAcceptedObservations: number;
  from?: string;
  to?: string;
};

export type SynchronizationResult = {
  pagesProcessed: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  revisionUpdates: number;
  nextCursor?: string;
};

const PROVIDER_ID = "mayday-intelligence-int-del-001c";
const OPERATION_TYPES = new Set(["backfill", "incremental"]);
export type ReviewEligibility = "eligible" | "ineligible" | "requires_review" | "unknown";

export type SynchronizedObservationReview = {
  documentId: string;
  priorEligibility: ReviewEligibility;
  eligibility: Extract<ReviewEligibility, "eligible" | "ineligible">;
  operator: { subjectId: string; application?: string };
  note?: string;
  decidedAt: string;
};

function now(): string {
  return new Date().toISOString();
}

function fingerprint(observation: NewsObservation): string {
  return createHash("sha256").update(JSON.stringify(observation), "utf8").digest("hex");
}

function assertBounds(bounds: SynchronizationBounds): void {
  if (
    !Number.isInteger(bounds.pageSize) || bounds.pageSize < 1 || bounds.pageSize > 100 ||
    !Number.isInteger(bounds.maximumPages) || bounds.maximumPages < 1 ||
    !Number.isInteger(bounds.maximumAcceptedObservations) || bounds.maximumAcceptedObservations < 1 ||
    (bounds.from && Number.isNaN(Date.parse(bounds.from))) ||
    (bounds.to && Number.isNaN(Date.parse(bounds.to))) ||
    (bounds.from && bounds.to && Date.parse(bounds.from) > Date.parse(bounds.to))
  ) {
    throw new Error("Synchronization requires explicit, valid bounded page and timestamp limits.");
  }
}

export class IntelligenceObservationCache {
  constructor(readonly database: DatabaseSync) {}

  listEligible(limit = 20): PublicNewsObservation[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Cached observation limit must be between 1 and 100.");
    return this.database.prepare(`
      SELECT observation_json FROM intelligence_observations
      WHERE provider_id = ? AND eligibility = 'eligible'
      ORDER BY synchronized_at DESC, document_id DESC LIMIT ?
    `).all(PROVIDER_ID, limit).map((row) => toPublicNewsObservation(normalizeNewsObservation(JSON.parse(String(row.observation_json)))));
  }

  latestSuccessfulSync(): string | undefined {
    const row = this.database.prepare(`
      SELECT MAX(last_successful_sync_at) AS last_successful_sync_at
      FROM intelligence_sync_checkpoints WHERE provider_id = ? AND last_successful_sync_at IS NOT NULL
    `).get(PROVIDER_ID) as { last_successful_sync_at: string | null } | undefined;
    return row?.last_successful_sync_at ?? undefined;
  }

  checkpoint(operationType: "backfill" | "incremental"): string | undefined {
    const row = this.database.prepare(`
      SELECT continuation_cursor FROM intelligence_sync_checkpoints
      WHERE provider_id = ? AND operation_type = ?
    `).get(PROVIDER_ID, operationType) as { continuation_cursor: string | null } | undefined;
    return row?.continuation_cursor ?? undefined;
  }

  reviewEligibility(
    documentId: string,
    eligibility: Extract<ReviewEligibility, "eligible" | "ineligible">,
    operator: { subjectId: string; application?: string },
    note?: string,
  ): SynchronizedObservationReview {
    if (!documentId || !operator.subjectId || (note !== undefined && (!note.trim() || note.length > 500))) {
      throw new Error("The synchronized observation review is invalid.");
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.database.prepare(`
        SELECT eligibility, observation_json FROM intelligence_observations
        WHERE provider_id = ? AND document_id = ?
      `).get(PROVIDER_ID, documentId) as { eligibility: ReviewEligibility; observation_json: string } | undefined;
      if (!current) throw new Error("The synchronized observation does not exist.");
      if (current.eligibility !== "requires_review") {
        throw new Error("Only requires_review observations can receive an eligibility decision.");
      }
      const observation = normalizeNewsObservation(JSON.parse(current.observation_json));
      const reviewed = normalizeNewsObservation({
        ...observation,
        publicFeed: { eligibility, reasons: eligibility === "eligible" ? [] : ["safety-review"] },
      });
      const decidedAt = now();
      this.database.prepare(`
        UPDATE intelligence_observations SET eligibility = ?, observation_json = ?, synchronized_at = ?
        WHERE provider_id = ? AND document_id = ?
      `).run(eligibility, JSON.stringify(reviewed), decidedAt, PROVIDER_ID, documentId);
      this.database.prepare(`
        INSERT INTO intelligence_observation_review_audit_events (
          provider_id, document_id, prior_eligibility, new_eligibility, operator_subject_id,
          operator_application, note, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(PROVIDER_ID, documentId, current.eligibility, eligibility, operator.subjectId, operator.application ?? null, note?.trim() ?? null, decidedAt);
      this.database.exec("COMMIT");
      return { documentId, priorEligibility: current.eligibility, eligibility, operator, note: note?.trim(), decidedAt };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  applyPage(operationType: "backfill" | "incremental", observations: readonly NewsObservation[], cursor: string | undefined): Pick<SynchronizationResult, "accepted" | "duplicates" | "revisionUpdates" | "rejected"> {
    const receivedAt = now();
    let duplicates = 0;
    let revisionUpdates = 0;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const observation of observations) {
        const documentId = observation.identity.intelligenceDocumentId;
        const digest = fingerprint(observation);
        const existing = this.database.prepare(`
          SELECT content_fingerprint, eligibility FROM intelligence_observations WHERE provider_id = ? AND document_id = ?
        `).get(PROVIDER_ID, documentId) as { content_fingerprint: string; eligibility: ReviewEligibility } | undefined;
        if (!existing) {
          this.database.prepare(`
            INSERT INTO intelligence_observations (
              provider_id, document_id, upstream_revision_marker, content_fingerprint, observation_json,
              eligibility, received_at, synchronized_at
            ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
          `).run(PROVIDER_ID, documentId, digest, JSON.stringify(observation), observation.publicFeed.eligibility, receivedAt, receivedAt);
        } else if (existing.content_fingerprint !== digest) {
          revisionUpdates += 1;
          this.database.prepare(`
            UPDATE intelligence_observations
            SET content_fingerprint = ?, observation_json = ?, eligibility = ?, synchronized_at = ?
            WHERE provider_id = ? AND document_id = ?
          `).run(digest, JSON.stringify({
            ...observation,
            publicFeed: {
              eligibility: existing.eligibility,
              reasons: existing.eligibility === "eligible" ? [] : ["safety-review"],
            },
          }), existing.eligibility, receivedAt, PROVIDER_ID, documentId);
        } else duplicates += 1;
      }
      this.database.prepare(`
        INSERT INTO intelligence_sync_checkpoints (
          provider_id, operation_type, continuation_cursor, started_at, completed_at, pages_processed,
          observations_accepted, observations_rejected, duplicates, revision_updates, last_successful_sync_at,
          provider_state, error_code
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'current', NULL)
        ON CONFLICT(provider_id, operation_type) DO UPDATE SET
          continuation_cursor = excluded.continuation_cursor,
          completed_at = excluded.completed_at,
          pages_processed = intelligence_sync_checkpoints.pages_processed + 1,
          observations_accepted = intelligence_sync_checkpoints.observations_accepted + excluded.observations_accepted,
          observations_rejected = intelligence_sync_checkpoints.observations_rejected + excluded.observations_rejected,
          duplicates = intelligence_sync_checkpoints.duplicates + excluded.duplicates,
          revision_updates = intelligence_sync_checkpoints.revision_updates + excluded.revision_updates,
          last_successful_sync_at = excluded.last_successful_sync_at,
          provider_state = 'current', error_code = NULL
      `).run(PROVIDER_ID, operationType, cursor ?? null, receivedAt, receivedAt, observations.length, 0, duplicates, revisionUpdates, receivedAt);
      this.database.prepare(`
        INSERT INTO intelligence_sync_audit_events (provider_id, operation_type, event_type, detail_code, occurred_at)
        VALUES (?, ?, 'checkpoint-advanced', NULL, ?)
      `).run(PROVIDER_ID, operationType, receivedAt);
      this.database.exec("COMMIT");
      return { accepted: observations.length, rejected: 0, duplicates, revisionUpdates };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

export class ManualIntelligenceSynchronizer {
  constructor(
    private readonly provider: LiveIntelligenceObservationProvider,
    private readonly cache: IntelligenceObservationCache,
  ) {}

  async backfill(bounds: SynchronizationBounds): Promise<SynchronizationResult> {
    return this.synchronize("backfill", bounds, undefined);
  }

  async incrementallySynchronize(bounds: Omit<SynchronizationBounds, "from" | "to">): Promise<SynchronizationResult> {
    return this.synchronize("incremental", bounds, this.cache.checkpoint("incremental"));
  }

  private async synchronize(operationType: "backfill" | "incremental", bounds: SynchronizationBounds, initialCursor: string | undefined): Promise<SynchronizationResult> {
    if (!OPERATION_TYPES.has(operationType)) throw new Error("Unsupported synchronization operation.");
    assertBounds(bounds);
    let cursor = initialCursor;
    let pagesProcessed = 0;
    let accepted = 0;
    let duplicates = 0;
    let revisionUpdates = 0;
    for (; pagesProcessed < bounds.maximumPages && accepted < bounds.maximumAcceptedObservations; pagesProcessed += 1) {
      const page = await this.provider.listForSynchronization({
        cursor,
        limit: Math.min(bounds.pageSize, bounds.maximumAcceptedObservations - accepted),
        from: bounds.from,
        to: bounds.to,
      });
      const records = page.observations.slice(0, bounds.maximumAcceptedObservations - accepted);
      // The frozen upstream DTO has no revision ID. A changed canonical content
      // fingerprint is recorded as a local revision update, never as a publication revision.
      const persisted = this.cache.applyPage(operationType, records, page.nextCursor);
      accepted += persisted.accepted;
      duplicates += persisted.duplicates;
      revisionUpdates += persisted.revisionUpdates;
      cursor = page.nextCursor;
      if (!cursor || records.length === 0) break;
    }
    return { pagesProcessed, accepted, rejected: 0, duplicates, revisionUpdates, nextCursor: cursor };
  }
}

export class SynchronizedObservationProvider implements NewsObservationProvider {
  readonly capabilities: ObservationProviderCapabilities = {
    cursorPagination: false,
    temporalFiltering: false,
    topicFiltering: false,
    incrementalUpdates: true,
    liveIntelligence: true,
  };

  constructor(
    private readonly cache: IntelligenceObservationCache,
    private readonly freshnessWindowMs = 15 * 60 * 1000,
  ) {}

  get status(): ObservationProviderStatus {
    const lastSuccessfulSync = this.cache.latestSuccessfulSync();
    if (!lastSuccessfulSync) return { mode: "unavailable", provider: "live", synthetic: false, detail: "service-unavailable" };
    const stale = Date.now() - Date.parse(lastSuccessfulSync) > this.freshnessWindowMs;
    return { mode: stale ? "synchronized-stale" : "synchronized-current", provider: "live", synthetic: false };
  }

  async list(query: ObservationQuery = {}): Promise<ObservationPage> {
    if (query.cursor || query.topic || query.from || query.to) throw new Error("The synchronized cache supports only bounded listing.");
    const limit = query.limit ?? 8;
    return { observations: this.cache.listEligible(limit), provider: "live", synthetic: false, mode: this.status.mode };
  }

  async get(observationId: string): Promise<PublicNewsObservation | undefined> {
    return this.cache.listEligible(100).find((observation) => observation.observationId === observationId);
  }
}
