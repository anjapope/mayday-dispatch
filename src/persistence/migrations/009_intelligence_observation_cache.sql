CREATE TABLE intelligence_observations (
  provider_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  upstream_revision_marker TEXT,
  content_fingerprint TEXT NOT NULL,
  observation_json TEXT NOT NULL,
  eligibility TEXT NOT NULL CHECK (eligibility IN ('eligible', 'ineligible', 'requires_review', 'unknown')),
  received_at TEXT NOT NULL,
  synchronized_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, document_id)
);

CREATE INDEX idx_intelligence_observations_eligibility
  ON intelligence_observations(provider_id, eligibility, synchronized_at DESC);

CREATE TABLE intelligence_sync_checkpoints (
  provider_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('backfill', 'incremental')),
  continuation_cursor TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  pages_processed INTEGER NOT NULL DEFAULT 0 CHECK (pages_processed >= 0),
  observations_accepted INTEGER NOT NULL DEFAULT 0 CHECK (observations_accepted >= 0),
  observations_rejected INTEGER NOT NULL DEFAULT 0 CHECK (observations_rejected >= 0),
  duplicates INTEGER NOT NULL DEFAULT 0 CHECK (duplicates >= 0),
  revision_updates INTEGER NOT NULL DEFAULT 0 CHECK (revision_updates >= 0),
  last_successful_sync_at TEXT,
  provider_state TEXT NOT NULL,
  error_code TEXT,
  PRIMARY KEY (provider_id, operation_type)
);

CREATE TABLE intelligence_sync_rejections (
  id INTEGER PRIMARY KEY,
  provider_id TEXT NOT NULL,
  document_id TEXT,
  reason_code TEXT NOT NULL,
  rejected_at TEXT NOT NULL
);

CREATE TABLE intelligence_sync_audit_events (
  id INTEGER PRIMARY KEY,
  provider_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  document_id TEXT,
  detail_code TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_intelligence_sync_audit_provider_time
  ON intelligence_sync_audit_events(provider_id, occurred_at DESC);
