# Architecture

```text
Research Studio -> machine authentication -> App Router -> publication gateway
                                              |          |
                                              |          +-> authorization policy
                                              |          +-> EvidenceRegistry
                                              v
                                      PublicationRepository
                                              |
                                      SQLite transaction
                       publication/revision/links/history/audit/idempotency
                                              |
                                  EvidenceRegistry / Mayday3 metadata
```

The Phase One domain in `src/domain/publication.ts` remains the canonical
publication, lifecycle, validation, and public-projection contract. The Phase
Two gateway remains the orchestration boundary. SQLite storage is provided by
`SqlitePublicationRepository` without moving persistence or transport concerns
into the domain. Research Studio reaches that boundary through the typed HTTP
client under `src/integrations/research-studio`.

## Boundaries

- App Router handlers parse transport identity and correlation headers only.
- Machine authentication establishes an application actor from configured
  bearer-token hashes or signed-request secrets. Roles are only loaded from
  the matched server-side credential record.
- `PublicationAuthorizationPolicy` decides what that actor may do.
- The gateway validates DTOs, enforces expected versions, resolves registered
  evidence, applies lifecycle policy, and produces stable errors.
- `PublicationRepository.save` owns the atomic storage boundary. A successful
  mutation includes its revision, relationships, lifecycle history when
  changed, audit event, and optional idempotency record.
- `EvidenceRegistry` proves that evidence metadata was registered elsewhere.
  Dispatch stores references and never processes uploads. Mayday3 registers
  controlled metadata through the same registry, with evidence revisions,
  lineage, idempotency, and evidence audit records.
- Operational logs are transient structured entries; durable audit events
  remain part of publication transactions and publication history.

## Disclosure boundary

Only `public` publications in `published` or `updated` state can be projected.
The projection omits provenance, origin links, internal notes, visibility,
private/internal evidence, locators, checksums, processors, and evidence
provenance. Internal gateway origin-link metadata and Overwatch assessment
metadata are never part of the public DTO. Editorial preview uses this same
projection function.

## Failure model

Validation and authorization happen before persistence. SQLite writes use
`BEGIN IMMEDIATE` and roll back on any failure. Optimistic concurrency is
checked again inside that transaction, so two callers that read the same
version cannot both commit. Raw SQLite messages are translated to stable
gateway errors.
