# TGH-INT-004A Dispatch supervised synchronization worker

## Scope and topology

This phase adds only Dispatch-side operational plumbing. The worker consumes
the existing authenticated, private Intelligence endpoint through the existing
003C/003D transport and persists only into the Dispatch-owned cache. It has no
publication, release, publisher, or editorial-lifecycle dependency. Mayday3
provider and SSH tunnel lifecycle remain TGH-INT-004B responsibilities.

## Worker and configuration

`npm run intelligence:worker` starts the standalone worker. It uses the
existing incremental synchronization implementation, never starts a broad
backfill, and requires a readable token file. Supported settings are:

- `MAYDAY_INTELLIGENCE_ENDPOINT`
- `MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE`
- `MAYDAY_INTELLIGENCE_SYNC_INTERVAL_SECONDS` (default 300; minimum 60)
- `MAYDAY_INTELLIGENCE_SYNC_MAX_PAGES` (1-5)
- `MAYDAY_INTELLIGENCE_SYNC_MAX_OBSERVATIONS` (1-100)
- `MAYDAY_INTELLIGENCE_REQUEST_TIMEOUT_MS`
- `MAYDAY_INTELLIGENCE_RUN_TIMEOUT_MS`
- `MAYDAY_INTELLIGENCE_STALE_AFTER_SECONDS`
- `MAYDAY_INTELLIGENCE_DEGRADED_AFTER_FAILURES`
- `MAYDAY_INTELLIGENCE_MAX_RETRIES`
- `MAYDAY_INTELLIGENCE_RETRY_BASE_SECONDS`

The token remains outside the repository and is never supplied on a command
line. Each run is bounded by pages, observations, transport limits, retries,
and an overall timeout.

## State, locking, and recovery

Migration 011 creates one durable worker state row, an exclusive database
lease, and bounded worker audit events. A second worker fails before syncing.
The lease is released on graceful termination. State records last success,
failure category, consecutive failures, next run, pause state, and safe run
counts. Transient timeout/rate-limit/unavailable failures retry with bounded
exponential delay; authentication and contract failures do not retry. Repeated
transient failures enter `degraded`; success resets the counter.

Existing cache/checkpoint transactions remain authoritative. Replay preserves
operator `eligible`/`ineligible` decisions and their review audit history;
new documents remain `requires_review`.

## Operator surface

`/api/operations/intelligence-sync` requires the existing `operator` role.
It returns only safe worker state, review counts, and checkpoint presence.
Operators can pause, resume, or request one bounded manual incremental sync.
Each action is durably audited. No token, SSH details, raw source content, or
private Intelligence internals are returned.

## Windows deployment artifact

`scripts/install-intelligence-sync-task.ps1` and
`scripts/remove-intelligence-sync-task.ps1` prepare a user-logon Scheduled
Task for `MAYDAY1\anjap`. The task uses `MultipleInstances IgnoreNew`, bounded
restart behavior, and the repository working directory. It is **not**
installed or activated by this phase. The deployment operator must set the
endpoint and protected token-file environment externally before installation.

## TGH-INT-004B dependency

004B must still establish the restricted tunnel-only SSH identity, durable
Mayday1 tunnel supervision, loopback-only Mayday3 provider lifecycle, and the
integrated cross-host rehearsal. No public activation, DNS change, permanent
tunnel, or provider service was created here.
