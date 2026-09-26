CREATE INDEX idx_evidence_search_state ON evidence_references(status, visibility);
CREATE INDEX idx_evidence_search_processor ON evidence_references(processor);
CREATE INDEX idx_evidence_search_collection ON evidence_references(collection_id);
CREATE INDEX idx_evidence_search_parent ON evidence_references(parent_evidence_id);
CREATE INDEX idx_evidence_search_checksum ON evidence_references(checksum);
CREATE INDEX idx_evidence_search_acquired ON evidence_references(acquisition_at);
