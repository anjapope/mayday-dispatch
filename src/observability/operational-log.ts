import { GatewayError } from "@/application/publication-gateway/errors";

/**
 * Structured operational logging around the Research Studio / Evidence
 * Registry integration boundary. This is intentionally separate from
 * `AuditEvent` (docs/audit.md): audit events are durable, per-mutation
 * SQLite records scoped to publication history; operational log entries
 * are transient, per-call observability records intended for log
 * aggregation, latency dashboards, and error-rate alerting.
 *
 * Entries never include request/response bodies, publication content,
 * internal notes, credentials, or any other secret material -- only
 * identifiers, the operation name, its outcome, timing, and an optional
 * stable error code.
 */
export type OperationOutcome = "success" | "error";

export type OperationLogEntry = {
  timestamp: string;
  operation: string;
  correlationId: string;
  requestId: string;
  application?: string;
  publicationId?: string;
  evidenceId?: string;
  result: OperationOutcome;
  durationMs: number;
  errorCode?: string;
};

export type OperationalLogSink = (entry: OperationLogEntry) => void;

function defaultSink(entry: OperationLogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

let sink: OperationalLogSink = defaultSink;

/** Test/operator hook to redirect log entries away from stdout. */
export function setOperationalLogSink(customSink: OperationalLogSink): void {
  sink = customSink;
}

export function resetOperationalLogSink(): void {
  sink = defaultSink;
}

export type OperationLogMeta = {
  operation: string;
  correlationId: string;
  requestId: string;
  application?: string;
  publicationId?: string;
  evidenceId?: string;
};

/**
 * Runs `fn`, emitting a single structured log entry for its outcome and
 * duration. `resolvePublicationId` may derive a publication ID from the
 * result when it is not known before the call (for example, on create).
 */
export async function withOperationalLog<T>(
  meta: OperationLogMeta,
  fn: () => Promise<T>,
  resolvePublicationId?: (result: T) => string | undefined,
  resolveEvidenceId?: (result: T) => string | undefined,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await fn();
    sink({
      timestamp: new Date().toISOString(),
      operation: meta.operation,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
      application: meta.application,
      publicationId: meta.publicationId ?? resolvePublicationId?.(result),
      evidenceId: meta.evidenceId ?? resolveEvidenceId?.(result),
      result: "success",
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    sink({
      timestamp: new Date().toISOString(),
      operation: meta.operation,
      correlationId: meta.correlationId,
      requestId: meta.requestId,
      application: meta.application,
      publicationId: meta.publicationId,
      evidenceId: meta.evidenceId,
      result: "error",
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: error instanceof GatewayError ? error.code : undefined,
    });
    throw error;
  }
}