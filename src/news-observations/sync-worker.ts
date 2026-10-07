import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { createConfiguredLiveIntelligenceProvider } from "@/news-observations/intelligence-transport";
import { IntelligenceObservationCache, ManualIntelligenceSynchronizer, type SynchronizationResult } from "@/news-observations/synchronized-cache";
import { LiveConsumerError } from "@/news-observations/live-consumer";

export type WorkerState = "starting" | "current" | "stale" | "degraded" | "unavailable" | "authentication_failed" | "contract_error" | "paused" | "stopped";
export type WorkerConfig = {
  intervalSeconds: number;
  maxPages: number;
  maxObservations: number;
  requestTimeoutMs: number;
  runTimeoutMs: number;
  staleAfterSeconds: number;
  degradedAfterFailures: number;
  maxRetries: number;
  retryBaseSeconds: number;
};

const WORKER = "intelligence-sync";
const DEFAULT_CONFIG: WorkerConfig = {
  intervalSeconds: 300, maxPages: 2, maxObservations: 50, requestTimeoutMs: 10_000,
  runTimeoutMs: 60_000, staleAfterSeconds: 900, degradedAfterFailures: 3,
  maxRetries: 2, retryBaseSeconds: 5,
};

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  return parsed;
}

export function loadWorkerConfig(environment: Record<string, string | undefined> = process.env): WorkerConfig {
  if (!environment.MAYDAY_INTELLIGENCE_ENDPOINT?.trim()) throw new Error("MAYDAY_INTELLIGENCE_ENDPOINT is required.");
  const tokenFile = environment.MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE?.trim();
  if (!tokenFile || !existsSync(tokenFile)) throw new Error("MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE must reference an accessible file.");
  return {
    intervalSeconds: integer(environment.MAYDAY_INTELLIGENCE_SYNC_INTERVAL_SECONDS, DEFAULT_CONFIG.intervalSeconds, 60, 86_400, "MAYDAY_INTELLIGENCE_SYNC_INTERVAL_SECONDS"),
    maxPages: integer(environment.MAYDAY_INTELLIGENCE_SYNC_MAX_PAGES, DEFAULT_CONFIG.maxPages, 1, 5, "MAYDAY_INTELLIGENCE_SYNC_MAX_PAGES"),
    maxObservations: integer(environment.MAYDAY_INTELLIGENCE_SYNC_MAX_OBSERVATIONS, DEFAULT_CONFIG.maxObservations, 1, 100, "MAYDAY_INTELLIGENCE_SYNC_MAX_OBSERVATIONS"),
    requestTimeoutMs: integer(environment.MAYDAY_INTELLIGENCE_REQUEST_TIMEOUT_MS, DEFAULT_CONFIG.requestTimeoutMs, 1_000, 60_000, "MAYDAY_INTELLIGENCE_REQUEST_TIMEOUT_MS"),
    runTimeoutMs: integer(environment.MAYDAY_INTELLIGENCE_RUN_TIMEOUT_MS, DEFAULT_CONFIG.runTimeoutMs, 5_000, 300_000, "MAYDAY_INTELLIGENCE_RUN_TIMEOUT_MS"),
    staleAfterSeconds: integer(environment.MAYDAY_INTELLIGENCE_STALE_AFTER_SECONDS, DEFAULT_CONFIG.staleAfterSeconds, 60, 86_400, "MAYDAY_INTELLIGENCE_STALE_AFTER_SECONDS"),
    degradedAfterFailures: integer(environment.MAYDAY_INTELLIGENCE_DEGRADED_AFTER_FAILURES, DEFAULT_CONFIG.degradedAfterFailures, 1, 20, "MAYDAY_INTELLIGENCE_DEGRADED_AFTER_FAILURES"),
    maxRetries: integer(environment.MAYDAY_INTELLIGENCE_MAX_RETRIES, DEFAULT_CONFIG.maxRetries, 0, 5, "MAYDAY_INTELLIGENCE_MAX_RETRIES"),
    retryBaseSeconds: integer(environment.MAYDAY_INTELLIGENCE_RETRY_BASE_SECONDS, DEFAULT_CONFIG.retryBaseSeconds, 1, 300, "MAYDAY_INTELLIGENCE_RETRY_BASE_SECONDS"),
  };
}

function timestamp(): string { return new Date().toISOString(); }
function codeFor(error: unknown): WorkerState {
  if (error instanceof LiveConsumerError) {
    if (error.code === "authentication-failed") return "authentication_failed";
    if (error.code === "invalid-response" || error.code === "capability-incompatible") return "contract_error";
  }
  return "unavailable";
}
function transient(error: unknown): boolean {
  return error instanceof LiveConsumerError && ["timeout", "service-unavailable", "rate-limited"].includes(error.code);
}

export class IntelligenceSyncWorker {
  readonly instanceId = randomUUID();
  private stopped = false;

  constructor(
    private readonly database: DatabaseSync,
    private readonly config: WorkerConfig,
    private readonly synchronizer = new ManualIntelligenceSynchronizer(
      createConfiguredLiveIntelligenceProvider(process.env),
      new IntelligenceObservationCache(database),
    ),
  ) {}

  acquire(): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database.prepare("INSERT OR IGNORE INTO intelligence_sync_worker_leases (worker_name, instance_id, acquired_at) VALUES (?, ?, ?)").run(WORKER, this.instanceId, timestamp());
      if (result.changes !== 1) throw new Error("Another Intelligence synchronization worker already holds the lease.");
      this.transition("starting");
      this.audit("worker-start");
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  release(): void {
    this.stopped = true;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM intelligence_sync_worker_leases WHERE worker_name = ? AND instance_id = ?").run(WORKER, this.instanceId);
      this.transition("stopped");
      this.audit("worker-stop");
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  status(): Record<string, unknown> {
    const state = this.database.prepare("SELECT * FROM intelligence_sync_worker_state WHERE worker_name = ?").get(WORKER) as Record<string, unknown>;
    const counts = this.database.prepare(`
      SELECT COUNT(*) AS cached, SUM(eligibility = 'requires_review') AS requiresReview,
        SUM(eligibility = 'eligible') AS eligible, SUM(eligibility = 'ineligible') AS ineligible
      FROM intelligence_observations
    `).get() as Record<string, unknown>;
    const checkpoint = this.database.prepare("SELECT COUNT(*) AS count FROM intelligence_sync_checkpoints WHERE continuation_cursor IS NOT NULL").get() as { count: number };
    return { ...state, counts, checkpointPresent: checkpoint.count > 0 };
  }

  pause(actor?: string): void { this.setPause(true, actor); }
  resume(actor?: string): void { this.setPause(false, actor); }

  async runOnce(manual = false): Promise<SynchronizationResult | undefined> {
    const current = this.database.prepare("SELECT paused FROM intelligence_sync_worker_state WHERE worker_name = ?").get(WORKER) as { paused: number };
    if (current.paused && !manual) return undefined;
    if (manual) this.audit("manual-sync-request");
    this.transition("starting", { lastRunStartedAt: timestamp(), nextRunAt: null });
    this.audit("sync-start");
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const result = await Promise.race([
          this.synchronizer.incrementallySynchronize({ pageSize: Math.min(100, this.config.maxObservations), maximumPages: this.config.maxPages, maximumAcceptedObservations: this.config.maxObservations }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new LiveConsumerError("timeout", "Worker run timed out.")), this.config.runTimeoutMs)),
        ]);
        this.transition("current", {
          lastRunCompletedAt: timestamp(), lastSuccessfulSyncAt: timestamp(), lastFailureAt: null,
          failureCategory: null, consecutiveFailures: 0, latestPages: result.pagesProcessed,
          latestAccepted: result.accepted, latestDuplicates: result.duplicates, latestRejected: result.rejected,
          nextRunAt: new Date(Date.now() + this.config.intervalSeconds * 1000).toISOString(),
        });
        this.audit(attempt ? "recovery" : "sync-success");
        return result;
      } catch (error) {
        lastError = error;
        if (!transient(error) || attempt === this.config.maxRetries) break;
        this.audit("retry", error instanceof LiveConsumerError ? error.code : "unknown");
        await new Promise((resolve) => setTimeout(resolve, Math.min(this.config.retryBaseSeconds * 1000 * 2 ** attempt, 60_000)));
      }
    }
    const prior = this.database.prepare("SELECT consecutive_failures FROM intelligence_sync_worker_state WHERE worker_name = ?").get(WORKER) as { consecutive_failures: number };
    const failures = prior.consecutive_failures + 1;
    const state = codeFor(lastError);
    const nextState: WorkerState = failures >= this.config.degradedAfterFailures && state === "unavailable" ? "degraded" : state;
    this.transition(nextState, {
      lastRunCompletedAt: timestamp(), lastFailureAt: timestamp(), failureCategory: lastError instanceof LiveConsumerError ? lastError.code : "unknown",
      consecutiveFailures: failures, nextRunAt: new Date(Date.now() + this.config.retryBaseSeconds * 1000 * Math.min(2 ** failures, 12)).toISOString(),
    });
    this.audit(nextState === "degraded" ? "degraded" : "sync-failure", lastError instanceof LiveConsumerError ? lastError.code : "unknown");
    throw lastError;
  }

  private setPause(paused: boolean, actor?: string): void {
    this.database.prepare("UPDATE intelligence_sync_worker_state SET paused = ?, status = ?, next_run_at = NULL, updated_at = ? WHERE worker_name = ?")
      .run(paused ? 1 : 0, paused ? "paused" : "starting", timestamp(), WORKER);
    this.audit(paused ? "pause" : "resume", undefined, actor);
  }

  private transition(state: WorkerState, values: Record<string, string | number | null> = {}): void {
    const mapping: Record<string, string> = {
      lastRunStartedAt: "last_run_started_at", lastRunCompletedAt: "last_run_completed_at", lastSuccessfulSyncAt: "last_successful_sync_at",
      lastFailureAt: "last_failure_at", failureCategory: "failure_category", consecutiveFailures: "consecutive_failures",
      latestPages: "latest_pages", latestAccepted: "latest_accepted", latestDuplicates: "latest_duplicates", latestRejected: "latest_rejected", nextRunAt: "next_run_at",
    };
    const fields = ["status = ?", "instance_id = ?", "updated_at = ?"];
    const parameters: Array<string | number | null> = [state, this.instanceId, timestamp()];
    for (const [key, value] of Object.entries(values)) { fields.push(`${mapping[key]} = ?`); parameters.push(value); }
    parameters.push(WORKER);
    this.database.prepare(`UPDATE intelligence_sync_worker_state SET ${fields.join(", ")} WHERE worker_name = ?`).run(...parameters);
  }

  private audit(event: string, detail?: string, actor?: string): void {
    this.database.prepare("INSERT INTO intelligence_sync_worker_audit_events (event_type, instance_id, actor_subject_id, detail_code, occurred_at) VALUES (?, ?, ?, ?, ?)")
      .run(event, this.instanceId, actor ?? null, detail ?? null, timestamp());
  }
}
