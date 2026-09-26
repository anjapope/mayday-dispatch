# Editorial workspace

Dispatch is the editorial system of record for all publication origins. The workspace at
`/editorial` is a review surface over the same gateway used by Research Studio and Overwatch.
It does not create a second publication store or bypass gateway authorization.

The queue supports lifecycle, originating application, type, visibility, and originating-project
filters. Each row identifies the title, lifecycle, origin, type, visibility, version, evidence
count, and last modification time. Editors may inspect and revise drafts and review items, while
publisher/admin actors are required to move an item to `published`. External applications can
synchronize drafts but cannot publish directly.

The detail screen shows origin identity, timestamps, tags, citations, evidence metadata,
readiness findings, revision history, lifecycle history, and an internal Overwatch assessment
when present. The editorial controls edit publication-facing title, subtitle, summary, body,
tags, citations, visibility, methodology, and caveat with the current version. Origin identity
and internal Overwatch assessment metadata cannot be edited there.

The preview endpoint and visual preview use the exact `toPublicPublication` projection and
`PublicationArticle` rendering component used by the public route.
It can preview a public draft before publication; it never exposes provenance, stable source IDs,
internal assessment metadata, request identifiers, or private/internal evidence.

Editorial API clients should authenticate each request with a configured Dispatch actor and use:

- `GET /api/editorial/publications?state=review`
- `GET /api/editorial/publications/:id`
- `PATCH /api/editorial/publications/:id`
- `POST /api/editorial/publications/:id/transition`

All writes retain optimistic version checks, revision history, lifecycle history, idempotency, and
audit events provided by the publication gateway.

The review panel displays registered evidence metadata (visibility, media type, processor,
processing state, version, acquisition/processing timestamps, checksum algorithm, parent/
derivation lineage, citation, public URL, and provenance summary) without loading raw private
evidence content. Corrections, substantive updates, and archive reasons are represented as
typed revision/audit metadata.
