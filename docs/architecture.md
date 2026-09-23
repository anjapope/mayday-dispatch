# Architecture

```text
caller -> authentication adapter -> App Router -> publication gateway
                                              |          |
                                              |          +-> authorization policy
                                              |          +-> EvidenceRegistry
                                              v
                                      PublicationRepository
                                              |
                                      SQLite transaction
                       publication/revision/links/history/audit/idempotency
```

The Phase One domain in `src/domain/publication.ts` remains the canonical
publication, lifecycle, validation, and public-projection contract. The Phase
Two gateway remains the orchestration boundary. Phase Three replaces
process-memory production storage with `SqlitePublicationRepository` without
moving persistence or transport concerns into the domain.

## Boundaries

- App Router handlers parse transport identity and correlation headers only.
- Authentication establishes an actor. The built-in header adapter is for
  development and is disabled in production unless explicitly enabled.
- `PublicationAuthorizationPolicy` decides what that actor may do.
- The gateway validates DTOs, enforces expected versions, resolves registered
  evidence, applies lifecycle policy, and produces stable errors.
- `PublicationRepository.save` owns the atomic storage boundary. A successful
  mutation includes its revision, relationships, lifecycle history when
  changed, audit event, and optional idempotency record.
- `EvidenceRegistry` proves that evidence metadata was registered elsewhere.
  Dispatch stores references and never processes uploads.

## Disclosure boundary

Only `public` publications in `published` or `updated` state can be projected.
The projection omits provenance, origin links, internal notes, visibility,
private/internal evidence, locators, checksums, processors, and evidence
provenance. Internal gateway origin-link metadata is never part of the public
DTO.

## Failure model

Validation and authorization happen before persistence. SQLite writes use
`BEGIN IMMEDIATE` and roll back on any failure. Optimistic concurrency is
checked again inside that transaction, so two callers that read the same
version cannot both commit. Raw SQLite messages are translated to stable
gateway errors.
