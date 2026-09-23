# Persistence and migrations

Production gateway storage uses `SqlitePublicationRepository`. The database
path is configured with `MAYDAY_DATABASE_PATH`.

Schema changes are ordered SQL files under `src/persistence/migrations`.
`npm run db:migrate` applies unapplied files transactionally and records them in
`schema_migrations`. Application startup does not infer or mutate schema outside
this migration runner.

The schema provides queryable tables for publications, origins, revisions,
citations, publication-citation links, evidence references,
publication-evidence associations, lifecycle history, audit events, and
idempotency keys. JSON is used only for naturally ordered scalar arrays and
immutable revision snapshots.

Application startup never applies migrations; deployment/setup must run
`npm run db:migrate` first. Each mutation uses `BEGIN IMMEDIATE`, checks `current_version`, writes all
dependent records, and commits once. Any audit, relationship, history, revision,
or idempotency failure rolls back the entire mutation. WAL and foreign-key
enforcement are enabled. Database files and sidecars are Git-ignored.

Run `npm run test:migrations` to verify idempotent setup, required tables,
restart durability, history, evidence relationships, optimistic concurrency,
and rollback behavior.
