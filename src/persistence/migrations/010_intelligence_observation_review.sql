CREATE TABLE intelligence_observation_review_audit_events (
  id INTEGER PRIMARY KEY,
  provider_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  prior_eligibility TEXT NOT NULL CHECK (prior_eligibility IN ('eligible', 'ineligible', 'requires_review', 'unknown')),
  new_eligibility TEXT NOT NULL CHECK (new_eligibility IN ('eligible', 'ineligible', 'requires_review', 'unknown')),
  operator_subject_id TEXT NOT NULL,
  operator_application TEXT,
  note TEXT,
  decided_at TEXT NOT NULL
);

CREATE INDEX idx_intelligence_observation_review_audit_document
  ON intelligence_observation_review_audit_events(provider_id, document_id, decided_at DESC);
