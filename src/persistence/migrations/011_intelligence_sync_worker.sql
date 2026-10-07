CREATE TABLE intelligence_sync_worker_state (
  worker_name TEXT PRIMARY KEY CHECK (worker_name = 'intelligence-sync'),
  status TEXT NOT NULL CHECK (status IN ('starting', 'current', 'stale', 'degraded', 'unavailable', 'authentication_failed', 'contract_error', 'paused', 'stopped')),
  instance_id TEXT,
  started_at TEXT,
  last_run_started_at TEXT,
  last_run_completed_at TEXT,
  last_successful_sync_at TEXT,
  last_failure_at TEXT,
  failure_category TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  next_run_at TEXT,
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  latest_pages INTEGER NOT NULL DEFAULT 0 CHECK (latest_pages >= 0),
  latest_accepted INTEGER NOT NULL DEFAULT 0 CHECK (latest_accepted >= 0),
  latest_duplicates INTEGER NOT NULL DEFAULT 0 CHECK (latest_duplicates >= 0),
  latest_rejected INTEGER NOT NULL DEFAULT 0 CHECK (latest_rejected >= 0),
  updated_at TEXT NOT NULL
);

INSERT INTO intelligence_sync_worker_state (worker_name, status, paused, updated_at)
VALUES ('intelligence-sync', 'stopped', 0, '1970-01-01T00:00:00.000Z');

CREATE TABLE intelligence_sync_worker_leases (
  worker_name TEXT PRIMARY KEY CHECK (worker_name = 'intelligence-sync'),
  instance_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL
);

CREATE TABLE intelligence_sync_worker_audit_events (
  id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL,
  instance_id TEXT,
  actor_subject_id TEXT,
  detail_code TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_intelligence_sync_worker_audit_time
  ON intelligence_sync_worker_audit_events(occurred_at DESC);
