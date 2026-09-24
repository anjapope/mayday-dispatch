# Operations

`GET /api/health` reports only readiness data: service availability, database
reachability, and whether migrations are current. It returns HTTP 200 when
ready and HTTP 503 when degraded. It intentionally excludes filesystem and
database paths, connection strings, credentials, and machine names.

Gateway route operations emit one JSON log entry on completion. Each entry
contains timestamp, correlation ID, request ID, authenticated application
identity when available, operation name, relevant publication/evidence ID,
outcome, duration, and stable gateway error code when applicable. Logs do not
contain bearer tokens, HMAC secrets, request/document bodies, raw evidence
contents, checksums, or private notes.

Operational logs are transient observability records and are separate from
durable publication audit events. Audit events are written atomically with
successful publication mutations and remain the publication-history record.

Run `npm run db:migrate` before application startup. This phase uses Node's
experimental `node:sqlite` `DatabaseSync` API and targets Node 22.5 or newer.
The SQLite driver warning is expected; callers use the repository abstraction,
so a future driver replacement does not change gateway contracts.
