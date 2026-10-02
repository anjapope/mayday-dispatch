# TGH-INT-003C controlled Intelligence integration

## Frozen upstream contract

Dispatch implements the downstream consumer surface from
`anjapope/mayday-intelligence` commit
`1887cb280880c2faa14dbcfa574fc0f5759088eb` (`Harden INT-DEL-001 provider
contract`), on `feature/phase-2-live-acquisition`. The frozen DTO protocol is
`mayday.intelligence.document/1` (v1), mapped into Dispatch's existing
`mayday.news-observation/1` contract.

The only permitted upstream operations are authenticated `GET` requests:

- `/api/v1/provider/health`
- `/api/v1/provider/documents`
- `/api/v1/provider/documents/{document_id}`

Authentication is a server-side bearer credential with
`intelligence:documents:read`. `MAYDAY_INTELLIGENCE_ENDPOINT` and either
`MAYDAY_INTELLIGENCE_CONSUMER_TOKEN` or
`MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE` configure the client. Missing
configuration fails closed. Neither the token nor its path is passed to React,
browser APIs, public projections, or audit event content.

The provider document DTO includes stable `document_id`,
`source_record_id`, `source_record_identity`, source/title/URL/timestamps,
source and connector identity, source-backed topics/geography/verification,
and provenance rows. It deliberately does **not** expose an upstream revision
identifier or a feed-eligibility decision. Dispatch assigns its observation
ID, retains the upstream document ID as internal provenance, records a local
content fingerprint for change detection, and assigns `requires_review` until
a Dispatch review policy supplies eligibility. No synchronization process
elevates eligibility.

There is no capability-discovery endpoint in the frozen contract. The
transport's fixed capability document describes only this verified v1 surface.
Topic filtering is disabled: upstream returns `TOPIC_FILTER_UNSUPPORTED`.
Collection retrieval accepts bounded `limit` (1-100), `cursor`, `connector`,
`source_type`, inclusive `since`, and inclusive `until`; Dispatch uses only
the supported timestamp/cursor filters. Cursors are document-ID anchors in
descending `stored_at, id` order, not snapshot tokens. New documents can appear
ahead of a stored cursor, so periodic **manual** traversals remain necessary.

The transport enforces a timeout and configurable response-byte limit, has no
generic request API, and maps the typed provider error envelope to explicit
authentication, rate-limit, timeout, service-unavailable, or invalid-response
errors. The upstream service enforces its own 1-100 page limit, serialized
response ceiling, and per-consumer rolling rate limit.

## Dispatch persistence and recovery

Migration `009_intelligence_observation_cache.sql` adds an independent
Dispatch cache/ledger:

- `intelligence_observations` retains the document identity, a local content
  fingerprint, canonical normalized observation, eligibility, and receipt and
  sync timestamps.
- `intelligence_sync_checkpoints` retains bounded operation state and durable
  continuation, counters, last success, provider state, and bounded error
  code.
- `intelligence_sync_rejections` and `intelligence_sync_audit_events` retain
  only bounded operational diagnostics; neither table stores raw malformed
  payloads or credentials.

The cache does not read Intelligence SQLite, share models, mount its storage,
or join across databases. It is reconstructable only from the provider API.
Each accepted page writes observations, audit state, and checkpoint in one
local transaction. A crash before commit advances nothing; a crash after
observation commit but before the caller resumes is safe to replay because the
primary key is `(provider_id, document_id)`. Exact replays do not create rows.
The upstream contract has no revision ordering field, so Dispatch cannot label
an upstream response as a newer or stale revision; it records local
fingerprint changes without creating any publication revision.

## Manual operations and presentation

`ManualIntelligenceSynchronizer` provides bounded `backfill` and
`incrementallySynchronize` operations. Both require a positive page size,
maximum pages, and maximum accepted observations; backfill also accepts
optional ordered timestamps. There is no scheduler, daemon, cron entry, or
unattended loop.

`SynchronizedObservationProvider` reads only the Dispatch cache. It reports
`synchronized-current`, `synchronized-stale`, or `unavailable` from the last
successful checkpoint and a configurable freshness window. The homepage stays
on the permanent deterministic fixture provider unless
`MAYDAY_INTELLIGENCE_FEED_MODE=synchronized` is explicitly configured.
Only cached `eligible` observations appear in the automated feed or existing
geographic query. The map continues to require eligible observations,
`EVENT_LOCATION`, coordinates, and medium/high confidence. The v1 mapping
does not invent geography from a source, publisher, mention, or inference.

Synchronization has no imports of publication gateway, publisher, release, or
editorial authority code. It cannot create, edit, authorize, release, or
replace publications.

## Test status and next phase

Mock/local tests cover migration, transactional cache insertion/replay,
checkpoint durability, non-eligible projection exclusion, fixture preservation,
and existing consumer failure states. The concrete real-provider test is:

`CONTROLLED REAL-PROVIDER TEST DEFERRED — ENDPOINT/CREDENTIAL NOT CONFIGURED`

Before unattended synchronization, define an approved invocation boundary,
retry/backoff and operational ownership, monitoring, explicit eligibility
review workflow, safe new-document traversal policy, and a controlled
real-provider rehearsal. Public activation remains separately unauthorized.
