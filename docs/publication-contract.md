# Publication Contract

`PublicationSchema` remains the runtime source of truth. Revisions are
monotonically increasing positive integers. The current revision version is the
optimistic concurrency token exposed to clients as `originLink.version`.

Create requests contain editorial content, provenance, `evidenceIds`, and an
optional `expectedVersion` used only when intentionally revising an existing
origin. Dispatch always creates or synchronizes into `draft`.

Update requests require:

```json
{
  "title": "Revised title",
  "expectedVersion": 3,
  "revisionSummary": "Editorial title correction."
}
```

Evidence and lifecycle requests also require `expectedVersion`. Every committed
mutation increments the version exactly once and records `previousVersion`.

## Evidence references

Publication evidence is a snapshot of registered metadata: stable ID, title,
description, media type, source, provenance, visibility, SHA-256 checksum,
processor, status, public URL, locator, and optional citation. Only the
registered ID crosses the mutation contract; raw evidence metadata is rejected.

## Stable errors

Errors use:

```json
{
  "error": {
    "code": "STALE_VERSION",
    "message": "The publication version is stale.",
    "correlationId": "correlation-123",
    "details": {
      "expectedVersion": 2,
      "currentVersion": 3
    }
  }
}
```

Phase Three adds `STALE_VERSION`, `IDEMPOTENCY_CONFLICT`,
`PERSISTENCE_FAILURE`, `EVIDENCE_NOT_REGISTERED`, and `AUDIT_FAILURE`.
Database exceptions, SQL text, file paths, and private evidence contents are
never included.

## Public contract

The public response remains compatible with Phase One/Two: publication content,
revision, sources, and public/citation-only evidence. It never includes the
internal `originLink`, provenance, visibility, restricted evidence, audit data,
or processing metadata.
