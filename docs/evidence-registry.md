# Evidence Registry and Mayday3 registration contract

`EvidenceRegistry` resolves stable registered UUIDs. Dispatch never accepts raw
uploads and does not run evidence processors.

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

Statuses are `registered`, `processing`, `ready`, and `rejected`. Rejected or
unknown IDs cannot be associated. Public evidence needs `publicUrl` or a
citation; citation-only evidence needs a citation.

## Mayday3 contract

Mayday3 owns acquisition, checksum calculation, content storage, malware/content
processing, status transitions, and registry insertion. It must register the
DTO above before sending an evidence ID to Dispatch. IDs and checksums are
immutable; metadata corrections create an explicit registry revision outside
Dispatch. Dispatch stores a metadata snapshot plus the stable ID.

No Mayday3 worker, webhook, polling loop, queue consumer, upload endpoint, or
processor integration is implemented in this phase.
