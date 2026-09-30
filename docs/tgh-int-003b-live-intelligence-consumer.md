# TGH-INT-003B live Intelligence consumer foundation

## Architecture

Dispatch retains the `NewsObservationProvider` boundary. The active homepage
provider remains the deterministic fixture provider. A future
`LiveIntelligenceObservationProvider` is an additional read-only provider,
backed only by the typed `IntelligenceConsumerTransport` operations:
capability discovery, bounded observation listing, and optional individual
observation retrieval.

The live provider has no direct database, filesystem, ORM, Intelligence
repository, publication-gateway, editorial, or publisher dependency. It has
no write method. Tests use an in-memory mock transport; this phase adds no
HTTP implementation, endpoint configuration, scheduler, daemon, or real
Intelligence connection.

Provider status is explicit: `fixture`, `live`, `degraded`, or `unavailable`.
Fixture pages are always `synthetic: true`. A live state is set only after
successful capability negotiation and a successful response. Failure never
falls back to fixture data or presents fixtures as live.

## Authority and authentication

The future service identity is a dedicated Dispatch consumer identity, not a
human, publisher, administrator, Research Studio, Overwatch, or defensive
identity. It is limited to read-only observation scope. Credentials are
obtained by a caller-supplied provider and must contain a non-empty bearer
token plus an unexpired ISO expiry time. Missing or expired credentials fail
closed before a transport operation.

Production credentials, tokens, certificates, URLs, and secret values are not
configured or committed by this phase. A deployment may later name an
environment variable or secret-file path, but it must support expiration,
rotation, revocation, and auditability. Credentials are never included in
audit diagnostics.

## Capability negotiation

The versioned capability document is
`mayday.intelligence-consumer/1`. It requires a service identifier,
`mayday.news-observation/1`, supported read operations, cursor pagination,
maximum page size, topic and temporal filters, provenance/source/geography
references, health status, and a response-size limit.

Malformed documents and any incompatible API or observation-schema version are
rejected. Dispatch does not reinterpret an incompatible source record or
downgrade canonical validation.

## Retrieval and validation

The consumer supports opaque bounded cursors, newest-first data where the
upstream contract guarantees it, topic/time filters, optional single-record
retrieval, and a configurable maximum page size. `listBounded` makes at most
the configured number of page requests and rejects a continuation beyond that
bound. Each request has a retry ceiling of at most three retries. There is no
polling or continuous retrieval.

Every response is parsed through the existing canonical observation schema and
batch duplicate detection before public projection. Oversized pages, malformed
cursors, duplicate identities, invalid timestamps/URLs/geography, unsupported
versions, and malformed records are rejected. Canonical eligibility is
preserved: `requires_review`, `unknown`, and `ineligible` never become
`eligible`; only eligible records reach `toPublicNewsObservation`.

Internal records retain bounded stable identity, document/revision,
source/acquisition, provenance, and eligibility references. The public
projection excludes Intelligence document IDs, evidence IDs, acquisition
references, internal notes, transformation lineage, credentials, and service
identifiers without a public purpose.

## Geographic and failure behavior

The existing event-map query remains authoritative: public event points require
an eligible projected observation, `EVENT_LOCATION`, coordinates, and medium
or high confidence. Mentioned, source, inferred, unresolved, and low/unknown
confidence locations remain feed-only or excluded.

Authentication failures and incompatible capabilities are `unavailable`.
Timeouts, rate limits, service outages, and invalid responses are `degraded`.
Failures do not fabricate current data and no stale fixture record is relabeled
as live. Safe audit events record event class, provider, and bounded service
identifier only: capability negotiation/rejection, authentication rejection,
retrieval failure, malformed observation rejection, rate limiting, timeout,
and unavailability. They never record tokens or raw observations.

## Required upstream service before live authorization

Before a future live integration test is authorized, Mayday Intelligence must
provide an authenticated read-only consumer API with a dedicated revocable
Dispatch identity; the versioned capability document; stable observation,
document, and revision identities; cursor pagination and bounded filters;
source/provenance references; canonical eligibility; geographic context;
response-size and rate limits; safe structured errors; audit logging; and a
health/status operation. It must also define request timeouts and credential
rotation/revocation procedures. Dispatch must then implement a separately
reviewed transport without broad endpoint access or publication authority.

## Security inspection

TGH-INT-003B contains no `POST`, `PUT`, `PATCH`, or `DELETE` Intelligence
operation; write-capable provider method; SQLite/database or Intelligence
filesystem access; hard-coded endpoint; credential value; secret logging;
uncontrolled network call; unbounded retrieval loop; publication-gateway
import; publisher credential; or deployment change.
