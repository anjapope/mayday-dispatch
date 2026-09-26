ALTER TABLE schema_migrations ADD COLUMN checksum TEXT;

CREATE TABLE operational_controls (
  control_name TEXT PRIMARY KEY CHECK (control_name = 'publication-lockdown'),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  version INTEGER NOT NULL CHECK (version >= 0),
  changed_at TEXT NOT NULL,
  changed_by_subject TEXT NOT NULL
);

INSERT INTO operational_controls (
  control_name, enabled, version, changed_at, changed_by_subject
) VALUES (
  'publication-lockdown', 0, 0, '1970-01-01T00:00:00.000Z', 'system-bootstrap'
);

CREATE TABLE operational_audit_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  actor_roles_json TEXT NOT NULL,
  actor_application TEXT,
  action TEXT NOT NULL,
  control_name TEXT NOT NULL,
  resulting_version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  request_id TEXT NOT NULL
);

CREATE INDEX idx_operational_audit_control
  ON operational_audit_events(control_name, timestamp);
