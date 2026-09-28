# DPE-02A local staging rehearsal

## Outcome and boundaries

**Partially completed; not ready for DPE-02A acceptance or public launch.**
The production-mode standalone container, isolated staging database, HTTP
publication workflow, lockdown, independent database restore, and bounded
failure checks were exercised. A rollback to an older application source
version could not be verified because no recoverable prior image was available.
See the rollback section for the observed image-store failure and the required
follow-up.

The authoritative source baseline is `474e6a6` (`Complete Dispatch DPE-01
production establishment planning`). Phase Twelve remains in repository
history at `9cd5b08`. DPE-01 remains the governing infrastructure plan. This
rehearsal neither authorizes public launch nor begins DPE-02B.

No live DNS, public hosting, external identity provider, public tunnel, or
public deployment was configured. No production credentials or genuine
Mayday intelligence were used. All publication material in the staging
database is synthetic and clearly labeled. No commit or push was made.

## Baseline and Docker recovery

At the start of the resumed rehearsal, `main` was at `474e6a6` and matched
`origin/main`. The earlier uncommitted DPE-02A report and readiness note were
preserved and updated; implementation fixes and this report are uncommitted
worktree changes.

| Check | Observed result |
| --- | --- |
| `git status --short --branch` | Started `## main...origin/main`; final working tree contains only the DPE-02A source and documentation changes listed below. |
| `git log --oneline --decorate -6` | HEAD remains `474e6a6`, the expected DPE-01 baseline. |
| `git diff --check` | Passed at baseline and after the rehearsal edits. |
| `docker version` | Docker Desktop 4.43.2, Engine 28.3.2, Linux/amd64; server responds. |
| `docker compose version` | Compose v2.38.2-desktop.1. |
| Docker engine resources | 16 CPUs and 16,339,120,128 bytes engine memory reported. |
| Docker data location | Docker-managed WSL data disk at `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`, outside the OneDrive repository. |
| Host C: free space | Approximately 553 GB at the time measured; no disk-filling test was run against the host. |

Initially Docker Desktop was installed but stopped; the selected
`desktop-linux` endpoint pipe did not exist. The installed Docker Desktop
application was started normally using its UI executable. The Linux engine
then became operational. No Docker data reset, volume removal, global Docker
configuration change, virtualization installation, or alternate runtime
switch was made. Existing application activity on port 3100 was left
undisturbed.

## Staging layout and retained resources

The existing `compose.staging.yaml` was used with dedicated project
`mayday-dpe02a-staging` and the ignored root `.env.staging` file. The staging
application is production-mode Node/Next.js, runs as unprivileged `dispatch`
UID/GID 1001, and maps only host `127.0.0.1:3001` to container port 3000.
There is one application instance. No public interface or hostname is used.

| Resource | Staging value |
| --- | --- |
| Compose project | `mayday-dpe02a-staging` |
| Container | `mayday-dpe02a-staging-mayday-dispatch-1` |
| Active SQLite file | `/var/lib/mayday-dispatch/staging.sqlite` |
| Data volume | `mayday-dpe02a-staging_mayday-staging-data` |
| Backup volume | `mayday-dpe02a-staging_mayday-staging-backups` |
| Credential/session files | `%LOCALAPPDATA%\MaydayDispatch\dpe-02a-secrets`; distinct disposable files, mounted read-only |
| Browser-facing origin | `http://127.0.0.1:3001` |
| Public indexing | Disabled; `X-Robots-Tag: noindex, nofollow, noarchive` and `robots.txt` disallows all paths |

Both named Docker volumes are Docker-managed local storage under
`/var/lib/docker/volumes/...` in Docker Desktop's Linux data disk. The SQLite
database is not in OneDrive and is not in the container's ephemeral writable
layer. Credential JSON and session-signing key are independent staging-only
files. The app has no production secrets.

The staging container and both named volumes are intentionally retained for
continued private rehearsals. The active database contains synthetic test
records, including a published synthetic snapshot and a lockdown state left
enabled at the end of this rehearsal. Do not point another environment at
these resources or expose this service beyond loopback. Disposable one-off
failure-test containers and their scratch database files were removed.

## Build, migration, startup, and runtime

The Dockerfile's multi-stage Node 22 Bookworm build uses `npm ci`, generates
the Next.js standalone artifact, copies the runtime scripts, and starts the
application as non-root. A clean Linux container build and a subsequent
rebuild both completed, including Next.js compile, static generation, and
`postbuild` standalone preparation. The first two builds before a code fix
failed with SQLite `database is locked` while collecting page data: imported
publication/evidence gateway singletons opened the default SQLite database
during parallel route collection. Both singletons now construct lazily on
first service use, and the isolated container build passed.

The first live crawler response exposed a second issue: `robots.txt` had been
statically generated with indexing enabled, ignoring runtime staging
configuration. `app/robots.ts` is now dynamic; the running container returned
`User-Agent: *` and `Disallow: /`, along with the noindex response header.

Database migration is an explicit pre-start operation in the staging
runbook, not an automatic publication action. `npm run db:migrate` applied all
eight migrations to the empty staging database. Running it again succeeded
idempotently. The application health endpoint subsequently reported schema 8,
8/8 migrations, compatible and up to date. The production launcher requires a
valid credential set, session key, writable persistent database, lock
acquisition, and migration readiness before it starts Next.js.

The active container reached healthy status. Graceful restart shut down and
reopened the app against the same data volume; lockdown and the released
snapshot survived. An interrupted-deployment simulation stopped only this
Compose service, confirmed the loopback health endpoint refused connection
while stopped, then started it and observed healthy status and HTTP 200 in
10.18 seconds. The final rebuilt image was also used to recreate the retained
service; it reached healthy status with schema 8 current.

Observed runtime boundaries:

- `GET /api/health`: HTTP 200 with database reachable and migrations current.
- `GET /robots.txt`: no paths allowed.
- Internal SQLite path over HTTP: HTTP 404.
- Host binding: only `127.0.0.1:3001`.
- Runtime user: `dispatch`, not root.
- CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and noindex were present.
- The application emitted `Strict-Transport-Security: max-age=63072000;
  includeSubDomains`. This is a response observed on private loopback only;
  no external HSTS policy or DNS change was made. Before enabling it publicly,
  assess its two-year subdomain scope and HTTPS readiness of every affected
  subdomain.

The unauthenticated internal database URL was not exposed. Loopback and Docker
volume isolation do not replace a production network perimeter.

## Authentication and security

The staging configuration uses production-mode session validation, separate
credentials for the editor, publisher, operator, Research Studio, Overwatch,
and Mayday3 identities, and a distinct session-signing secret. Integration
credentials were not granted publisher authority. Mayday3's live synthetic
evidence registration succeeded; attempts by integration identities to
release the synthetic publication returned HTTP 403. An incorrect application
credential and invalid session were rejected with HTTP 401.

Browser-facing editorial requests initially failed exact-Origin validation:
inside the container Next.js reports the internal request URL as
`http://0.0.0.0:3000`, not the browser origin `http://127.0.0.1:3001`.
The application now supports an explicit `MAYDAY_EDITORIAL_ORIGIN`; staging
allows HTTP only for loopback when indexing is disabled, and production
requires HTTPS. The check does not trust caller-supplied forwarded host
headers. A regression test covers the internal-URL/browser-origin mismatch.

Production cookie settings remain `HttpOnly`, `SameSite=Strict`, and `Secure`.
Staging issued a Secure cookie, but its plain HTTP origin prevents a normal
browser from persisting/sending that cookie. The API rehearsal supplied the
session cookie explicitly; production cookie settings were not weakened.
There is no development-authentication fallback in the production-mode
container. CSP, origin validation, role checks, and application headers were
verified locally; external MFA, proxy restrictions, public TLS, and rate
limiting remain unimplemented.

## Synthetic publication-governance rehearsal

The workflow was exercised over HTTP against the isolated container:

1. Mayday3 registered synthetic evidence and Research Studio ingested a
   clearly labeled synthetic draft.
2. An editor authenticated, reviewed the draft, moved it to ready, and
   assessed its evidence/readiness.
3. Research Studio and Mayday3 release attempts were denied with HTTP 403.
4. An explicit publisher session released the ready record. Its private
   staging public snapshot became retrievable only after that action.
5. A subsequent internal synthetic revision was saved. The public snapshot
   still returned the original title and body.
6. A correction was staged; the original snapshot remained public until the
   publisher explicitly transitioned the revision to `updated`.
7. The explicitly released correction became the new public snapshot.
8. A further synthetic revision was staged, then an operator enabled
   publication lockdown. The attempted publisher transition returned HTTP
   423, and the last released snapshot remained unchanged.
9. Only the staging service was restarted. Lockdown remained enabled and the
   released snapshot was still present afterward.

The database recorded release manifests for versions 4 and 7, with persisted
content digests, immutable public snapshot JSON, publication revisions, and
audit events. The proposed version 8 remained unpublished while lockdown was
active. Publication was never triggered by ingestion, evidence registration,
readiness, migration, or deployment. All reachable test content remained
inside the loopback-only installation.

## Backup, restore, and migration compatibility

A consistent backup was created with the application's SQLite backup utility
in the dedicated backup volume. A separate restore target was created without
overwriting the active staging database. Backup elapsed time was about 0.50
seconds; restore elapsed time was about 1.24 seconds in this small local
dataset.

Both source and restored databases passed `PRAGMA integrity_check`. The
restored database reported compatible, current schema 8 with all eight
migrations. Read-only comparisons matched the active database for the
synthetic publication, release manifests and content digests, revisions,
publication audit events, operational lockdown control, and lockdown audit.
This verifies this local recovery path for this test dataset only. It is not
an off-host backup service, retention policy, monitoring signal, or recovery
objective.

An isolated copy with a deliberately mismatched applied-migration checksum
was refused by the migration command with exit 1; the active database was
untouched. A separate test start with a missing database failed closed before
starting the web server. The inconsistent fixture was removed. Migration 008
was not reversed.

## Previous-source image rollback rehearsal

The committed baseline `474e6a641b513131962ff5d62ffd9cfb277b3a90` was built in
a separate detached worktree at
`%LOCALAPPDATA%\MaydayDispatch\dpe-02a-previous-474e6a6-worktree`; the current
development worktree was never checked out or overwritten. A direct baseline
Docker build reproduced the route-collection `database is locked` failure.
For the previous-source image only, Next.js build workers were serialized by
setting `experimental.cpus: 1` in that temporary worktree's `next.config.ts`.
This build-only setting does not change the previous application runtime
source. The temporary worktree was subsequently removed.

The previous and current application images were run sequentially, each
against the same separate restored schema-8 database volume, with no
publication mutation requests. Both started as `dispatch`, reached healthy
container status, reported HTTP 200 from `/api/health`, and returned HTTP 200
for the existing synthetic public snapshot. Both health responses reported
eight of eight migrations, schema version 8 compatible and current. The
previous-source response served the released `updated` lifecycle snapshot
with title `DPE-02A SYNTHETIC corrected test publication`. The prior-source
application therefore showed no schema, release-manifest, or public-snapshot
compatibility restriction on this dataset.

The application/image identities used were:

| Image | Image ID | Result |
| --- | --- | --- |
| Current source before the write-readiness probe | `sha256:56e636e6a266e1b10da9db916e05596ff15dcd9457061c8a6b9a4cb3279e8623` | Healthy on schema 8; public snapshot HTTP 200. |
| Previous source `474e6a6` with build-only serialized workers | `sha256:5a39b456159b42e43aff172c20a026eca936364737364650e39a8a62cc60839f` | Healthy on schema 8; public snapshot HTTP 200; no manifest/snapshot incompatibility observed. |
| Current source with write-readiness health probe | `sha256:08c84e87d447b1e94d41c65c829e9b9b0db1ae5cecccb03f5b75dabe51d04063` | Used for the isolated runtime writer-lock failure and recovery test below. |

The temporary rollback-test database passed integrity checks before and after
both images. It retained the two existing release manifests and their public
content digests, the updated public snapshot, the publication revision
history, and publication lockdown. This is a successful previous-binary
startup/compatibility rehearsal for this schema and dataset, not a general
guarantee for arbitrary later migrations or data.

The retained staging service was not replaced during this check. Its manifest
at the earlier DPE-02A staging run was:

| Manifest field | Observed value |
| --- | --- |
| Git baseline | `474e6a6`; source tree included uncommitted DPE-02A changes |
| Build/image identifier | Docker image `sha256:56e636e6a266e1b10da9db916e05596ff15dcd9457061c8a6b9a4cb3279e8623` |
| Environment | Private local staging, Compose project `mayday-dpe02a-staging` |
| Schema | 8; all migrations compatible and current |
| Container start | `2026-09-28T02:49:39.738Z` |
| Health outcome | Healthy; `/api/health` HTTP 200 |
| Runtime account | `dispatch` UID/GID 1001 |
| Rollback reference | Previous-source image ID `sha256:5a39b456159b42e43aff172c20a026eca936364737364650e39a8a62cc60839f` was validated on a separate schema-8 restore. |

Migration 008 was not reversed. If a future prior binary does not support a
later schema, preserve the database and manifests; restore a compatible
application and/or a verified backup under an explicit recovery plan. Do not
claim rollback success merely because the process starts.

## Runtime database write-unavailability rehearsal

This test used the current-source image with the write-readiness probe and a
second, fresh restore of the synthetic staging backup in the dedicated
temporary volume `mayday-dpe02a-acceptance-io-lock-data`. The active staging
database, its retained backup, and the previous-version test database were
not used as the fault target.

The app first started healthy on the copied database: `/api/health` returned
HTTP 200 with `database.reachable=true` and `database.writable=true`. A
separate SQLite connection in a no-network container then held
`BEGIN IMMEDIATE`, preventing the application from acquiring a write
transaction while leaving reads available. During the held lock:

- `/api/health` returned HTTP 503 after the configured five-second SQLite
  busy timeout, with `status=degraded`, `database.reachable=true`, and
  `database.writable=false`.
- An authenticated editor `PATCH` received HTTP 500 with the generic
  `INTERNAL_ERROR` response after about five seconds; it did not return a
  success-shaped response.
- The published synthetic snapshot remained readable with its prior
  corrected title. No release manifest was added, and no publication was
  released.

After the lock-holder was stopped cleanly, health returned HTTP 200 with
`database.writable=true`. An authorized internal-only revision then succeeded
on the disposable copy. `PRAGMA integrity_check` returned `ok`; the two
preexisting release-manifest versions and digests were unchanged; the public
snapshot still had its released title; lockdown remained enabled at version
1; and publication audit history remained present. This verifies write-path
recovery and integrity for this controlled SQLite lock failure.

A separate attempt to simulate filesystem permission loss by changing modes
on the database volume after startup did **not** revoke the rights of SQLite's
already-open file descriptors: the health probe remained writable and an
internal-only revision succeeded on that disposable scratch copy. That
scratch copy was not used for the passing lock test, did not gain a release
manifest, and was removed. The test therefore does not claim that changing
filesystem permissions on an open SQLite file is an effective runtime
revocation method. A hardware/filesystem I/O error or host-level disk loss
was not induced.

## Failure simulations

| Condition | Observed result and boundary |
| --- | --- |
| Application restart | Graceful shutdown/start; health 200, lockdown and snapshot persisted. |
| Interrupted deployment | Staging service alone was stopped; health route was unavailable while stopped and recovered healthy after start (10.18 s). |
| Invalid session / wrong integration credential | HTTP 401; no privileged action. |
| Integration credential attempting release | HTTP 403; publisher-only authority preserved. |
| Release while locked | HTTP 423; previous public snapshot remained unchanged. |
| Failed migration | Isolated copy with a wrong stored checksum was rejected with exit 1; active DB untouched. |
| Missing persistent storage | Isolated start with a read-only data mount failed before web-server startup with `EROFS`; no anonymous data volume or app listener was retained. A separate missing database-file check also failed closed. |
| Failed health probe | A no-network disposable app container reached Next.js readiness, then a forced-failing probe marked it `unhealthy`; container was removed. |
| Insufficient storage | A 1 MiB disposable tmpfs reached `ENOSPC` on a 4 MiB write. No host disk or staging database was filled. This does not prove SQLite behavior under production disk exhaustion. |
| Runtime database writer unavailable | Separate SQLite connection held `BEGIN IMMEDIATE`; health returned HTTP 503 with `reachable=true`, `writable=false`; authenticated mutation returned HTTP 500 and the public snapshot/manifests remained unchanged. |
| Database writer recovery | Releasing the lock restored HTTP 200 and `writable=true`; a subsequent internal-only write succeeded, SQLite integrity remained `ok`, lockdown persisted, and no new release manifest appeared. |
| Filesystem permission change on open database | `chmod` after startup did not revoke existing SQLite file descriptors; that scratch-copy update succeeded internally and was discarded. This was not counted as successful access revocation. |
| Interrupted deployment / rollback | Service interruption/recovery and previous-source image compatibility were tested on isolated data copies. |

## Validation results

| Command | Result |
| --- | --- |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm test` | 14 test files, 71 tests passed. |
| `npm run test:migrations` | 1 file, 7 tests passed, including writer-lock health degradation/recovery. |
| `npm run test:integration` | 1 file, 6 tests passed. |
| Docker production standalone builds | Current-source image build passed with the write-probe change; previous-source image build passed with isolated serialized build workers. |
| Container migrations | Passed; schema 8, eight migrations. |
| `git diff --check` | Passed after edits. |

A host-side `npm run build` had earlier failed on a OneDrive-era `.next`
reparse-point artifact (`EINVAL` reading `build-diagnostics.json`). The
artifact was not deleted or overwritten because the repository is in OneDrive
and another local app may depend on it. Docker builds use an isolated Linux
builder and passed; do not infer the host-side build problem was repaired.
The Docker build emits a Next.js ESLint-plugin warning and Node's experimental
SQLite warning; neither prevented a successful build or runtime.

## Resource observations

While handling synthetic staging traffic, Docker reported container memory
between approximately 70 and 82 MiB, CPU from 0% to 0.82% in the sampled
moments, and 19 processes/threads. The final retained staging image inspect reported 108,577,369 bytes (about 104 MiB); Docker's
local listing may include shared build-layer accounting. These are
point-in-time measurements on this workstation, not capacity guarantees or
production sizing. Measured health
recovery after an intentional stop/start was 10.18 seconds; migration,
backup, and restore durations are recorded above.

## Remaining requirements and acceptance

The two previously outstanding validation requirements now pass for the
tested environment: baseline-image startup/manifest/snapshot compatibility
was verified on a copied schema-8 database, and loss/recovery of SQLite writer
availability was exercised on a different disposable copy. DPE-02A remains
subject to owner acceptance and the following limits:

1. The SQLite failure simulation was a held writer lock, not a hardware,
   host-filesystem, or storage-device I/O failure. Runtime permission changes
   to an already-open SQLite database did not revoke its existing descriptors.
2. The host-side `npm run build` OneDrive `.next` reparse-point issue remains
   unresolved; isolated Docker builds pass.
3. Keep the test instance private and synthetic; remove or retain it only
   through the documented staging owner procedure.

Production hosting/provider and production/staging separation outside this
local Compose installation, live DNS, public TLS, external MFA, ingress rate
limits and network perimeter, monitoring/alerting, off-host backups and
retention, recovery objectives, and on-call ownership remain unconfigured.
The registered canonical and protective domains are not changed here.
Publication sovereignty remains explicit: only an authenticated publisher
action can release or update content; an operator may lock publication but
cannot publish merely by deploying or operating the service.

**Both outstanding DPE-02A validation requirements passed within the limits
above. DPE-02A is ready for owner acceptance; this report does not itself
authorize public launch or DPE-02B.**

## Cleanup and retained state

The dedicated staging container, Compose project, active synthetic SQLite
database, backup, restored comparison database, named volumes, ignored
`.env.staging`, and disposable secret files were left for continued private
testing. Publication lockdown remains enabled. Temporary previous-source and
current health-test images, the detached baseline worktree, and the three
explicitly named disposable database-copy volumes were removed after their
results were recorded. No ad hoc test container or copied test database was
retained. The worktree checkout directory is gone and `git worktree list`
shows only the main worktree. Git's stale administrative metadata directory
under `.git/worktrees/dpe-02a-previous-474e6a6-worktree` could not be pruned:
the filesystem returned `Permission denied` under an explicit
`Everyone: Deny DeleteSubdirectoriesAndFiles` ACL. No ACL was changed or
bypassed; the orphan metadata remains a local cleanup limitation for the
workstation owner to resolve through its approved permissions procedure.

For an owner-authorized cleanup, first confirm the staging database and backup
are no longer needed. Then stop only this project with:

```powershell
docker compose --env-file .env.staging -f compose.staging.yaml -p mayday-dpe02a-staging stop
```

Do not remove named volumes as routine cleanup; they contain the retained
synthetic staging records and recovery artifacts. Do not use broad Docker
prune, delete Docker Desktop data, or clean unrelated projects.
