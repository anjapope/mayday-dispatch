CREATE TABLE publication_release_manifests (
  release_operation_id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  publication_version INTEGER NOT NULL CHECK (publication_version > 0),
  released_at TEXT NOT NULL,
  publisher_subject_id TEXT NOT NULL,
  public_content_digest TEXT NOT NULL CHECK (length(public_content_digest) = 64),
  evidence_validation_json TEXT NOT NULL,
  audit_correlation_id TEXT NOT NULL,
  public_status TEXT NOT NULL CHECK (public_status IN ('published', 'updated')),
  public_snapshot_json TEXT NOT NULL,
  UNIQUE (publication_id, publication_version)
);

CREATE INDEX idx_release_manifests_publication_version
  ON publication_release_manifests(publication_id, publication_version DESC);

CREATE INDEX idx_release_manifests_released_at
  ON publication_release_manifests(released_at DESC);
