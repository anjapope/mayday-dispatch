# Evidence Registry and Mayday3 registration contract

`EvidenceRegistry` resolves stable registered UUIDs. Dispatch never accepts raw
uploads and does not run evidence processors.

## HTTP API

`POST /api/evidence` registers metadata and returns HTTP 201. `GET
/api/evidence/:id` retrieves a registered item. `PATCH /api/evidence/:id`
requires `expectedVersion` and creates a durable evidence revision. All are authenticated,
controlled integration routes; registration and retrieval do not publish
evidence or associate it with a publication. Association is the separately
authorized `POST /api/publications/:id/evidence` route. External applications
may associate only `public` or `citation-only` evidence.

## Registered evidence DTO

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "title": "Methodology appendix",
  "description": "Optional non-secret description",
  "mediaType": "application/pdf",
  "source": "Research Studio",
  "provenance": "Mayday3 collection run 42",
  "visibility": "public",
  "checksum": "64 lowercase or uppercase SHA-256 hex characters",
  "processor": "pdf-extractor-v3",
  "status": "ready",
  "publicUrl": "https://example.org/evidence/appendix",
  "registeredAt": "2026-09-22T19:30:10.431Z",
  "citation": {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Source title",
    "authors": ["Research Desk"]
  }
}
```

Statuses are `registered`, `processing`, `ready`, `failed`, `rejected`, and
`superseded`. Only `ready` IDs can be associated. Public evidence needs `publicUrl` or a
citation; citation-only evidence needs a citation.

## Mayday3 contract

Mayday3 owns acquisition, checksum calculation, content storage, malware/content
processing, status transitions, and registry insertion. It must register the
DTO above before sending an evidence ID to Dispatch. IDs remain stable. Processing/provenance metadata changes require a current
evidence version and create an explicit evidence revision and audit event.
Checksums remain internal integrity metadata. Dispatch stores a metadata
snapshot plus the stable ID.

No Mayday3 worker, webhook, polling loop, queue consumer, upload endpoint, or
processor integration is implemented in this phase.
