# Production deployment and operations

## Scope and operating model

The repository ships a provider-neutral Docker/Compose baseline for the
existing Next.js App Router application. It is intended for one application
instance on one host with a persistent local volume. Compose binds the app to
`127.0.0.1:3000`; put a separately operated HTTPS reverse proxy in front of it.
No hosting provider, public domain, identity provider, or public deployment is
selected here.

SQLite remains the system of record. Do not put its file on NFS, SMB, object
storage, or a volume shared by hosts. SQLite WAL and the process lock do not
make a multi-host shared database a supported deployment. Run one application
process per database file. Production startup and the migration command share
an exclusive lock; a leftover lock after an unclean kill is deliberately
fail-closed and requires operator verification before removal.

Publication authority remains in Dispatch:

- Research Studio and Overwatch have individual `external-application`
  credentials and may submit/synchronize permitted drafts only.
- Mayday3 has its own `external-application` credential for evidence
  registration/update and has no publication role.
- Configured editorial accounts receive only their assigned `editor` and/or
  `publisher` roles. An explicit publisher performs the release through the
  Dispatch lifecycle.
- A separate `operator` account may inspect and change the publication
  lockdown. Production validation rejects operator credentials that also have
  `publisher`, `admin`, or `external-application`.
- The existing `admin` role remains broad and may publish. Do not give it to
  deployment or infrastructure operators.
- Public requests use the public projection only. The operator deployment
  account, application process, editor, publisher, and public reader are
  separate trust roles; they are not equivalent identities.

The application operator can still read/change the SQLite file, environment,
and process as host administrator. The role split is enforced by the
application, not against a fully privileged host administrator.

## Environments and secrets

Use a separate database volume, credential set, session key, and public URL
for development, test, staging, and production. Test suites use disposable
SQLite databases. Development fixtures are available only under
`NODE_ENV=development`; the production launcher forces `NODE_ENV=production`,
and production never seeds fixture records.

1. Copy [`.env.production.example`](../.env.production.example) to
   `.env.production`. Keep the copied file out of source control; `.env*` and
   `secrets/` are ignored.
2. Create a credentials JSON file and a distinct random session signing key.
   Place them in protected host files at the paths named in
   `.env.production`; do not paste live values into this runbook or commit
   them. Restrict host-file access to deployment operators. Compose mounts
   them as read-only secrets.
3. The credentials file contains one record per identity. Example shape only;
   replace all placeholder hashes before use:

   ```json
   [
     {
       "applicationName": "Research Studio",
       "subjectId": "research-studio-prod",
       "roles": ["external-application"],
       "tokenHash": "<64-character SHA-256 hex digest>"
     },
     {
       "applicationName": "overwatch",
       "subjectId": "overwatch-prod",
       "roles": ["external-application"],
       "tokenHash": "<64-character SHA-256 hex digest>"
     },
     {
       "applicationName": "mayday3",
       "subjectId": "mayday3-prod",
       "roles": ["external-application"],
       "tokenHash": "<64-character SHA-256 hex digest>"
     },
     {
       "applicationName": "Dispatch Editorial",
       "subjectId": "publisher-account-1",
       "roles": ["editor", "publisher"],
       "tokenHash": "<64-character SHA-256 hex digest>"
     },
     {
       "applicationName": "Dispatch Operations",
       "subjectId": "on-call-operator-1",
       "roles": ["operator"],
       "tokenHash": "<64-character SHA-256 hex digest>"
     }
   ]
   ```

   The placeholder is intentionally invalid. Issue independent high-entropy
   bearer tokens for each identity, store the plaintext only in the applicable
   password manager/upstream secret store, and configure only the SHA-256
   digest in Dispatch. HMAC credentials are also supported, but their secrets
   must be unique. Production startup rejects duplicate tokens/secrets,
   missing upstream identities, development-header authentication, a missing
   editor/publisher account, or an operator credential that can publish.
4. The session signing key must be at least 32 bytes. Set either
   `MAYDAY_SESSION_SECRET_FILE` (recommended) or `MAYDAY_SESSION_SECRET` in a
   non-container deployment, never both. Rotating the key invalidates every
   existing editorial session.
5. The browser sign-in exchanges a configured Dispatch bearer credential for
   an eight-hour signed, `HttpOnly`, `SameSite=Strict` cookie. Cookies are
   `Secure` in production. Each request checks a credential fingerprint that
   binds the current token/HMAC key and assigned roles; changing either,
   removing the account, or rotating the session-signing key invalidates
   existing sessions. State-changing cookie requests require an exact
   same-origin `Origin` header. Logout clears malformed and expired cookies.
   Upstream application credentials cannot sign into the editorial UI.
6. This application-level sign-in is not an OIDC/MFA provider. Before public
   launch, expose editorial routes only behind the organization's VPN/identity
   perimeter, enable MFA and rate limiting for `/api/editorial/session`, and
   preserve the external host and `Origin` through the reverse proxy. Do not
   configure a proxy to give browser users a shared publisher identity.
7. API request bodies are limited to 1 MiB in application code. Enforce an
   equal or smaller request-size limit at the ingress, and separately
   configure connection/rate limits; the body cap is not a DoS or bandwidth
   control.

## Disposable staging

The checked-in staging profile binds to `127.0.0.1:3001`, uses distinct
`mayday-staging-*` volumes, has no canonical public URL, and enables
`MAYDAY_PUBLIC_INDEXING_DISABLED`. That setting returns a sitewide noindex
header and disallows all robots paths. It does not prevent access or replace
network restrictions.

1. Copy `.env.staging.example` to the ignored `.env.staging`; keep its staging
   database path and `MAYDAY_PUBLIC_INDEXING_DISABLED=true`.
2. Create separate, disposable credentials for Research Studio, Overwatch,
   Mayday3, one editor/publisher, and one operator. Use synthetic content and
   unique test tokens only. Keep the credential JSON and a random session key
   under the ignored `secrets/` directory; never reuse a production value or
   restricted source/client data.
3. Build and rehearse only against the staging Compose profile:

   ```sh
   docker compose --project-name mayday-staging --env-file .env.staging -f compose.staging.yaml build
   docker compose --project-name mayday-staging --env-file .env.staging -f compose.staging.yaml run --rm --no-deps mayday-dispatch npm run db:migrate
   docker compose --project-name mayday-staging --env-file .env.staging -f compose.staging.yaml up -d
   ```

4. Verify the bound port, health, `X-Robots-Tag`, `robots.txt`, empty
   production-shaped page, sign-in, release, lockdown, backup, restart, restore,
   and rollback behavior. Retain test records only in the staging volume.
5. `compose.staging.yaml` has separate named volumes and a loopback-only port.
   Do not attach a public URL, configure public DNS, or disable noindex during
   rehearsal.

Credential rotation: provision a new, independent token and subject, update
the relevant upstream and Dispatch credential stores, verify the new identity
against staging, then remove the old record and restart/redeploy. Never reuse
the Research Studio, Overwatch, Mayday3, publisher, or operator secret. Session
key rotation is separate and intentionally signs out all editorial users.

## Build, migrate, start, and health

The Compose service has one replica, a non-root Node 22 runtime, explicit
`/var/lib/mayday-dispatch` persistent storage, a separate backup volume, and a
Docker health check. It is not exposed on a public interface. Configure TLS,
HTTP-to-HTTPS redirection, host allow-listing, and any canonical-host redirect
at the reverse-proxy/deployment layer. Preserve the original `Host` and
same-origin `Origin`; Dispatch does not trust arbitrary forwarded-host headers.

Use the env file for Compose interpolation and container environment:

```sh
docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm --no-deps mayday-dispatch npm run db:migrate
docker compose --env-file .env.production up -d
docker compose --env-file .env.production ps
```

For an existing production database with pending migrations, first stop the
application, then run migration with a **new** pre-migration backup path:

```sh
docker compose --env-file .env.production stop mayday-dispatch
docker compose --env-file .env.production run --rm --no-deps mayday-dispatch `
  npm run db:migrate -- --backup /var/backups/mayday-dispatch/pre-release.sqlite
docker compose --env-file .env.production up -d
```

Use the shell continuation syntax appropriate to the operator's shell. The
first deployment has no prior database to back up. Later production migrations
refuse to proceed when a populated schema is behind unless `--backup` names a
new destination. Migrations are ordered, transactional, tracked by name and
SHA-256 checksum, and checked for unknown names, gaps, altered applied files,
and target-version compatibility. The launcher does not run or repair
migrations: it refuses to start unless the database exists, is writable, and
has the exact compatible schema.

The health endpoint is `GET /api/health`. It returns only availability,
database reachability, and installed/target schema versions; it does not return
paths, hostnames, or credentials. It responds 503 when the database or
migration state is not ready. An active publication lockdown is not an
availability failure. Do not use this endpoint as editorial authorization.

`npm start` uses the same production validation/lock launcher outside
containers. It checks secrets, database location/permissions, migration
compatibility, then starts Next.js. It logs structured startup/shutdown records
to stdout/stderr and forwards termination to Next.js. Development remains
`npm run dev`; do not run it against a production database.

## SQLite, migrations, backup, and restore

- Set `MAYDAY_DATABASE_PATH` to an explicit absolute path outside `public/`.
  Compose defaults to `/var/lib/mayday-dispatch/mayday-dispatch.sqlite`; persist
  the containing volume across container replacement. The process configures
  WAL, full synchronous commits, foreign keys, and a bounded busy timeout.
- Keep the single-writer deployment rule. The application and migration
  launcher use a database-adjacent exclusive process-lock file. If the process
  was forcibly killed and the lock remains, verify that no process/container
  owns that database before removing only the specific
  `*.sqlite.process-lock` file. Never automate stale-lock removal.
- Check schema state with `npm run db:status`. Run `db:migrate` only as an
  explicit release operation. The migration script does not drop, replace, or
  seed a production database. If it fails, stop and investigate; do not delete
  the migration tracker or rerun a hand-edited SQL migration.
- Create an online, transactionally consistent SQLite snapshot with
  `npm run db:backup -- /var/backups/mayday-dispatch/<new-name>.sqlite`.
  `VACUUM INTO` includes publication data, revisions, evidence and links,
  editorial and operational audit, and control state; it avoids an arbitrary
  copy of the active database/WAL. The destination must be new and outside
  `public/`. The backup is integrity-checked and set to owner-only permissions
  where supported. Backups on the same host/volume are not disaster recovery:
  copy verified backups to a separately secured, off-host location and test
  retrieval.
- Restore is non-destructive and requires a new destination:

  ```sh
  npm run db:restore -- /path/to/backup.sqlite /path/to/new-dispatch.sqlite
  npm run db:status
  ```

  In Compose, run the command inside the service image with the backup and
  destination on mounted paths, stop the app before switching
  `MAYDAY_DATABASE_PATH`, then recreate/start it. Restore verifies SQLite
  integrity and migration compatibility and refuses to overwrite an existing
  target. It never writes over the active production database. Run
  `db:status` after selecting the restored path; if the backup schema is
  compatible but behind, take another backup and run the controlled migration.
- Practice restore on disposable storage, never over the production path.
  Validate public reads, editorial reads, evidence relationships, audit history,
  lockdown state, and database health before any deliberate cutover.

There are no automatic down migrations. An application rollback does not undo
database changes. Keep migrations additive/backward-compatible where possible.
If a database restore is necessary, restore to a new path from a verified
backup and deliberately switch configuration only after application downtime
and data-loss implications are accepted.

## Publication release and lockdown

Only an authenticated actor with `publisher` or the existing broad `admin`
role can explicitly move a ready publication to `published`. Readiness errors
still block release. A successful release writes a durable `publication.release`
audit event in the same SQLite transaction as the publication revision,
including the configured actor subject, roles, exact resulting revision, and
release timestamp. Upstream credentials and `operator` alone cannot release.

The lockdown control is separate from site maintenance:

- Sign in as a configured operator and use `/editorial/operations`, or
  authenticate directly to `GET`/`PUT /api/operations/publication-lockdown`.
- `PUT` accepts `{"enabled":true}` to activate and `{"enabled":false}` to
  deactivate. Only `operator` may change/read it. The server rejects
  cross-origin cookie requests.
- Each actual activation/deactivation atomically updates the control state and
  appends an `operational_audit_events` row with operator subject, timestamp,
  resulting version, and request/correlation IDs. Repeating the current value
  is a no-op.
- While active, the central publication gateway rejects all transitions to
  `published` or `updated`, regardless of whether the caller uses the
  editorial or upstream-facing route. Existing public content stays public;
  draft ingestion, evidence registration, and safe editorial work continue.
- The control is persisted in SQLite. Deploying/restarting the application,
  applying migrations, or running a worker does not deactivate it. Only an
  explicit authorized operator action does so.

The control is not maintenance mode, a content withdrawal mechanism, or
protection against a privileged host administrator modifying the database.

## Public assets, projections, and indexing

There is no upload or managed-media route. `public/` contains only
source-controlled static assets (currently the map atlas); it is not an
evidence store. Evidence records retain metadata/visibility and optional
already-governed URLs. Source files, acquisition output, database files,
backups, and temporary processing data must remain outside `public/`. The
startup, backup, and restore tools reject database/backup paths under that
directory.

Public HTML, public publication APIs, and sitemap entries use the
`PublicPublication` projection and only `public` visibility in `published` or
`updated` state, backed by an exact, verified release manifest. Public queries
validate the snapshot digest and matching audit event; later editorial changes
do not alter the live snapshot. Editorial previews, API routes, and editorial
pages are separate; editorial pages send `noindex` metadata. The robots file
disallows editorial subroutes and API paths, but
authorization/projection—not robots—is the privacy boundary. There is no RSS
feed.

Migration 008 adds release-manifest storage without backfilling Phase Eleven
records. Existing `published` or `updated` rows without a manifest are omitted
from public pages, search, and sitemap until a publisher verifies and explicitly
re-releases each record. This is intentional fail-closed behavior; do not
bulk-create manifests from mutable rows.

Set `MAYDAY_PUBLIC_BASE_URL` to the selected HTTPS origin to emit canonical
article/index metadata, absolute sitemap URLs, and the sitemap reference in
`robots.txt`. Until a domain is selected the variable remains unset and the
sitemap is empty; no domain is hard-coded. The sitemap enumerates only the
public query result. Set `MAYDAY_PUBLIC_INDEXING_DISABLED=true` in staging to
send `X-Robots-Tag` and disallow all robots paths. The CSP uses per-response
script/style nonces, blocks objects and frames, and permits HTTPS images
because public content may reference governed external media. The renderer
uses `referrerPolicy=no-referrer`; a third-party image host can still receive
the reader's network request. The interactive map uses a local static image
and inline positional styles; there is no required third-party map/media
service.
The reverse proxy must terminate HTTPS; HSTS is sent by the application.

## Logging, monitoring, and incident response

Application operational logs are structured JSON on stdout and contain event
name, request/correlation IDs, application identity when known, outcome,
duration, and stable error code. They exclude request bodies, source content,
credentials, checksums, and private notes. Authentication rejections and
editorial sign-ins are logged without credential material. Migration, backup,
restore, startup, and shutdown operations emit operational records.

The SQLite editorial/security audit is distinct and durable across restarts and
log rotation. Publication actions remain transactionally coupled to revision
changes. Lockdown events have their own durable operational audit table. Retain
and back up the SQLite file; stdout retention does not replace the database
audit.

Use an external monitor/log sink to:

- poll `/api/health` and alert on non-2xx responses;
- alert on database/migration/startup/backup failures and repeated
  authentication rejections;
- review publication releases and lockdown activation/deactivation from the
  durable audit tables;
- verify scheduled off-host backups and periodically run a disposable restore.

Dispatch does not include a hosted monitoring, alert delivery, backup
scheduler, or secrets vault. Docker's health check is only local process
readiness and is not an alerting system.

Incident response:

1. Preserve logs and a consistent database backup; do not copy an active WAL
   database as a lone file.
2. If publication activity is suspect and the database remains available,
   activate lockdown with a separate operator identity and verify its durable
   audit event.
3. Restrict traffic at the reverse proxy/network boundary if application or
   host integrity is uncertain. Lockdown is not a substitute for isolation.
4. Revoke/rotate the affected application credential or session signing key;
   inspect audit history and access logs for the incident interval.
5. Restore only into a new disposable path, validate it, and cut over
   deliberately. Do not overwrite production during investigation.
6. Deactivate lockdown only through an explicit operator action after the
   publisher and incident owner authorize release.

## Release, rollback, and recovery checklist

Before deployment:

1. Confirm the candidate image, clean migrations, compatible Node runtime, and
   staged production configuration; never build with development fixture data.
2. Confirm the persistent volume, free disk, backup destination, secrets, TLS
   proxy, and health monitor.
3. Stop the one app process before applying production migrations.
4. Create and verify a new pre-migration SQLite backup. Do not proceed if this
   backup fails.
5. Build/deploy the candidate and run the ordered migration command. Preserve
   the old image and the pre-migration backup.
6. Start the app with production validation, then verify container status,
   `GET /api/health`, public routes, sitemap/canonical configuration, and
   editorial sign-in with separate editor/publisher/operator identities.
7. Verify an unpublished/ready publication remains absent from public routes
   and sitemap; verify explicit authorized release writes the correct audit
   event; verify an upstream credential cannot release; verify operator
   lockdown blocks release and leaves already-public content reachable.

Rollback conditions include failed migration/startup, unhealthy database,
unexpected public projection, unauthorized lifecycle success, missing durable
audit, or public content disappearance. Stop the candidate first. Migration
008 is additive and old code can open its schema, but the Phase Eleven
application does not understand release manifests and reads mutable
publication rows. Roll back the application alone only before Phase Twelve
edits, releases, or archives have been written. After any such operation,
restore the verified pre-upgrade backup to a **new** database path, cut over
deliberately to that path and the prior image, and preserve the later database
for investigation. This discards writes since the backup. Do not claim
rollback until schema, publication visibility, revision/audit history,
evidence relationships, and lockdown have been checked.

For an interrupted startup, inspect Compose/container state and the exact
database process-lock file. Do not remove it while the owning process may still
be active. If no owner remains, preserve the lock for incident records, remove
only that specific stale lock file, verify database integrity and migration
status, then retry startup. Never reset, replace, or delete the database as a
restart remedy.

## Remaining launch decisions

Before public launch, the service owner must select the canonical domain and
TLS/reverse-proxy configuration, the host/provider and durable off-host backup
target, the organization's MFA/SSO perimeter and rate limits, log retention
and alert destinations, recovery objectives, legal review, privacy retention,
and an on-call operator/publisher rotation. Those infrastructure decisions
are intentionally not selected or deployed by this phase.
