ALTER TABLE evidence_references ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE evidence_references ADD COLUMN checksum_algorithm TEXT NOT NULL DEFAULT 'sha256';
ALTER TABLE evidence_references ADD COLUMN source_url TEXT;
ALTER TABLE evidence_references ADD COLUMN acquisition_at TEXT;
ALTER TABLE evidence_references ADD COLUMN processed_at TEXT;
ALTER TABLE evidence_references ADD COLUMN original_filename TEXT;
ALTER TABLE evidence_references ADD COLUMN collection_id TEXT;
ALTER TABLE evidence_references ADD COLUMN original_identifier TEXT;
ALTER TABLE evidence_references ADD COLUMN acquisition_method TEXT;
ALTER TABLE evidence_references ADD COLUMN provenance_note TEXT;
ALTER TABLE evidence_references ADD COLUMN parent_evidence_id TEXT REFERENCES evidence_references(id);
ALTER TABLE evidence_references ADD COLUMN derivation_type TEXT;
ALTER TABLE evidence_references ADD COLUMN superseded_by TEXT REFERENCES evidence_references(id);
ALTER TABLE evidence_references ADD COLUMN processing_error TEXT;

CREATE TABLE evidence_revisions (
  evidence_id TEXT NOT NULL REFERENCES evidence_references(id),
  version INTEGER NOT NULL,
  previous_version INTEGER,
  updated_at TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY (evidence_id, version)
);

CREATE TABLE evidence_audit_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_application TEXT,
  action TEXT NOT NULL,
  evidence_id TEXT NOT NULL REFERENCES evidence_references(id),
  previous_version INTEGER,
  resulting_version INTEGER,
  outcome TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  error_code TEXT
);

CREATE TABLE evidence_idempotency_keys (
  actor_scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  evidence_id TEXT NOT NULL REFERENCES evidence_references(id),
  resulting_version INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor_scope, idempotency_key)
);

CREATE INDEX idx_evidence_revisions_evidence ON evidence_revisions(evidence_id, version);
CREATE INDEX idx_evidence_audit_evidence ON evidence_audit_events(evidence_id, timestamp);
