PRAGMA foreign_keys = ON;

CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  visibility TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body_json TEXT NOT NULL,
  published_at TEXT NOT NULL,
  reading_time_minutes INTEGER NOT NULL,
  tags_json TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  internal_notes TEXT
);

CREATE TABLE origins (
  publication_id TEXT PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT,
  originating_application TEXT NOT NULL,
  originating_project TEXT NOT NULL,
  stable_object_id TEXT NOT NULL,
  last_synchronized_at TEXT NOT NULL,
  UNIQUE (originating_application, originating_project, stable_object_id)
);

CREATE TABLE revisions (
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  previous_version INTEGER,
  updated_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY (publication_id, version)
);

CREATE TABLE citations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors_json TEXT NOT NULL,
  publisher TEXT,
  published_at TEXT,
  url TEXT,
  doi TEXT
);

CREATE TABLE publication_citations (
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  citation_id TEXT NOT NULL REFERENCES citations(id),
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (publication_id, citation_id)
);

CREATE TABLE evidence_references (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  media_type TEXT NOT NULL,
  source TEXT NOT NULL,
  provenance TEXT NOT NULL,
  visibility TEXT NOT NULL,
  checksum TEXT NOT NULL,
  processor TEXT,
  status TEXT NOT NULL,
  public_url TEXT,
  locator TEXT,
  citation_id TEXT REFERENCES citations(id),
  registered_at TEXT NOT NULL
);

CREATE TABLE publication_evidence (
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence_references(id),
  associated_version INTEGER NOT NULL,
  associated_at TEXT NOT NULL,
  PRIMARY KEY (publication_id, evidence_id)
);

CREATE TABLE lifecycle_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  version INTEGER NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_roles_json TEXT NOT NULL,
  actor_application TEXT,
  action TEXT NOT NULL,
  publication_id TEXT,
  correlation_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  previous_version INTEGER,
  resulting_version INTEGER,
  outcome TEXT NOT NULL,
  reason TEXT,
  error_code TEXT
);

CREATE TABLE idempotency_keys (
  actor_scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  resulting_version INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor_scope, idempotency_key)
);

CREATE INDEX idx_publications_lifecycle ON publications(lifecycle_state);
CREATE INDEX idx_origins_identity ON origins(originating_application, originating_project, stable_object_id);
CREATE INDEX idx_revisions_publication ON revisions(publication_id, version);
CREATE INDEX idx_audit_publication ON audit_events(publication_id, timestamp);
CREATE INDEX idx_lifecycle_publication ON lifecycle_history(publication_id, changed_at);
