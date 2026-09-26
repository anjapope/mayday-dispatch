ALTER TABLE revisions ADD COLUMN revision_type TEXT NOT NULL DEFAULT 'editorial';
ALTER TABLE revisions ADD COLUMN actor_subject TEXT;
ALTER TABLE revisions ADD COLUMN actor_application TEXT;
ALTER TABLE revisions ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE audit_events ADD COLUMN revision_type TEXT;
ALTER TABLE publications ADD COLUMN subtitle TEXT;
