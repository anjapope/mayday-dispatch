# Dispatch Production Establishment (DPE-01)

**Status: infrastructure assessment only. The Golden Horn reports owning
`thegoldenhorn.news` and `thegoldenhorn.org`, registered through Spaceship
effective 2026-09-27 for a combined initial one-year cost of US$14.81. No live
DNS, hosting provider, identity service, or public deployment is configured.
This plan authorizes no further purchase, DNS change, public deployment, or
editorial release.**

## 1. Executive recommendation

For the initial low-volume service, use one Linux host running the existing
Next.js standalone container under Docker Compose, with one local persistent
filesystem and one SQLite database. Put a separately administered HTTPS
reverse proxy and identity-aware perimeter in front of the host. Keep the
container port published only on host loopback/private networking, expose
only HTTPS publicly, and provide editorial and operational routes with
MFA-protected access. Keep machine integration endpoints reachable only
through an explicitly designed API policy; do not put upstream callers behind
a human browser sign-in flow.

Use `https://thegoldenhorn.news` as the only canonical public origin. Serve
`thegoldenhorn.org` as a permanent redirect to the matching path and query on
the `.news` origin. Both names require working DNS and valid TLS: HTTPS
requests to `.org` must complete TLS before the browser can receive the
redirect. Keep domain registration/renewal and DNS account recovery under
organization-controlled ownership. Registering domains does not mean DNS,
mail, certificates, hosting, or public site service is configured.

Store the active SQLite file on local SSD-backed storage on that one host.
Back it up through the existing consistent SQLite backup command to encrypted
off-host storage. Do not use a network filesystem or object store as the live
SQLite volume. Keep the first deployment single-instance/single-writer; do not
attempt active-active replicas.

This recommendation is a technical starting point, not a purchase decision.
The inexpensive VPS path has the closest match to the repository's existing
Compose configuration and provides the clearest control over SQLite storage.
Managed container services are viable only after their persistent-volume,
single-instance, backup, private-access, and deployment behavior have been
rehearsed. A managed database or application rewrite is not required for
DPE-01.

## 2. Current application inventory

The inventory below reflects repository source at the DPE-01 baseline,
`9cd5b08b4683ce9ef419c870f2abfa110ccea9bb`.

| Area | Current capability and assumption |
| --- | --- |
| Application | Next.js App Router, React 19, TypeScript; Next.js standalone output is enabled. |
| Runtime | Dockerfile builds and runs on `node:22-bookworm-slim`; `node:sqlite` requires Node 22.5 or later. Pin and rehearse an exact supported Node 22 image digest for production. |
| Container | Multi-stage build, non-root `dispatch` UID/GID 1001, health check, and declared state/backup volume mount points are present. |
| Compose | `compose.staging.yaml` defines one app container, loopback-published port 3001, separate staging data/backup volumes, and file-mounted application/session secrets. It is staging-specific, not a configured production service. |
| Configuration | `.env.production.example` and `.env.staging.example` describe database path, credential-file paths, session-signing key, canonical URL, indexing control, and development-header setting. They contain no usable live credentials. |
| Startup | `npm start` invokes `scripts/start-production.mjs`. It forces production mode, validates credentials and configuration, obtains an exclusive database-process lock, checks writability and migration readiness, then starts the standalone Next.js server. It does not migrate automatically. |
| Database | `SqlitePublicationRepository` enables WAL, `synchronous=FULL`, foreign keys, and a 5-second busy timeout. It is a single-host file-backed database; one application process per database is the supported model. |
| Migrations | `npm run db:migrate` applies versioned SQL, checks migration ordering/checksums, obtains a process lock, and requires a pre-migration backup for a production database that needs migration. Startup rejects incompatible/outdated schema state. |
| Backup/restore | `npm run db:backup` makes a consistent SQLite backup after database/migration checks. `npm run db:restore` restores to a new destination and validates it; it refuses to overwrite an existing target. |
| Identity | Server-side credentials define roles. Production requires distinct upstream identities, editor, publisher, and a separate operator. Editorial browser sessions are HMAC-signed, eight hours, HttpOnly/SameSite=Strict, and Secure in production; they are not MFA or an identity provider. |
| Publication authority | Upstream credentials have only `external-application` roles; Mayday3 registers evidence and cannot publish. A Dispatch publisher explicitly releases a version. An operator controls persisted publication lockdown and is not a publisher. CI/deployment is not a publisher. |
| Public integrity | Public queries return verified public-safe snapshots bound to release manifests and audit records. Public views do not reconstruct content from mutable draft rows. Evidence is not a publicly served upload store. |
| Health/logging | `/api/health` checks service/database/migration readiness and returns no paths or secrets. Structured application logs omit request bodies, publication content, raw evidence, and credentials; operational identifiers still require restricted access and retention review. |
| CI/deployment | No checked-in `.github` workflow was found at the baseline. No deployment automation or provider is configured. Deployment must be explicitly initiated and authorized. |
| Dependencies | Runtime dependencies are Next.js, React, and Zod; database access uses Node's built-in SQLite API. Development/test dependencies include TypeScript, ESLint, and Vitest. A lockfile is checked in. |
| Canonical origin | `MAYDAY_PUBLIC_BASE_URL` drives metadata base, sitemap URLs, and the robots sitemap reference. Set it to `https://thegoldenhorn.news` in production; the current example remains intentionally blank. |

The Phase Twelve completion work confirmed application-level release
authorization, snapshot integrity, session checks, lockdown, and a native
database backup/restore. The private Compose rehearsal was not completed
because Docker Desktop's Linux engine was unavailable. No external perimeter,
off-host backup, MFA, production host, or live provider configuration has
been verified.

## 3. Production architecture

```text
                         Public readers and crawlers
                                    |
                       https://thegoldenhorn.news
                                    |
                  +-----------------v-----------------+
                  | DNS + TLS reverse proxy / edge    |
                  | - canonical .news host and HTTPS  |
                  | - public route policy/rate limits  |
                  | - MFA identity gate for humans     |
                  | - sanitized forwarding headers     |
                  +-----------+------------------------+
                              |
             private/loopback HTTP to app listener
                              |
               +--------------v----------------+
               | One Linux host / Docker Engine |
               |  Compose: one Dispatch app    |
               |  Node 22 standalone container |
               +------+---------------+---------+
                      |               |
             local SSD volume      read-only secret mounts
                      |               |
          +-----------v----+      +---v------------------+
          | SQLite + WAL   |      | Dispatch credentials |
          | one writer     |      | session signing key  |
          +-----------+----+      +----------------------+
                      |
       explicit consistent backup, encrypted before transfer
                      |
              +-------v-----------------+
              | Separate off-host backup|
              | account/provider/region |
              +-------------------------+

 Upstream systems -- separately credentialed, narrowly scoped HTTPS API -->
 edge route policy --> Dispatch integration endpoints

 thegoldenhorn.org -- DNS + valid TLS --> permanent host/path/query redirect
                                        to https://thegoldenhorn.news/...

 CI/build -- immutable artifact only --[explicit human deployment approval]-->
 host deployment operator (no publisher credential)
```

The edge must not become a source of editorial authority. The identity-aware
gate authenticates human access and adds MFA; Dispatch's own signed sessions,
credential role mapping, exact-origin checks, version checks, and release
manifest remain mandatory. Machine-to-machine API traffic uses separate
application credentials and narrowly scoped route policies rather than
publisher cookies.

### Public assets

The current application has no managed public-asset upload service:
`public/` contains source-controlled static assets, and evidence storage is
not public. Keep that behavior for the first deployment. If independently
governed public assets are later needed, store approved renditions in a
separate public-only asset store with controlled write access, immutable
versioning, malware/content review, and a deliberate release reference.
Never mount database, backup, evidence, or internal source directories under
the web root or public object namespace.

### Domain, DNS, redirects, TLS, and indexing

The organization-reported registration is:

| Name | Intended role | Required handling |
| --- | --- | --- |
| `thegoldenhorn.news` | Canonical publication host. | Configure the provider-required DNS records for the selected edge/origin, exposing the origin address only as required. Set `MAYDAY_PUBLIC_BASE_URL=https://thegoldenhorn.news` in production build/runtime configuration so metadata, sitemap, and robots sitemap URLs use the canonical HTTPS origin. |
| `thegoldenhorn.org` | Protective registration and redirect-only alias. | Point to the same managed edge/redirect service. Return a permanent 301 or 308 to `https://thegoldenhorn.news` while preserving the requested path and query. Do not serve a second copy of the site or emit `.org` canonical/sitemap URLs. |

These registrations are reported as effective September 27, 2026 through
Spaceship, at US$14.81 combined for the initial one-year registration. This is
the owner's supplied purchase information, not independently verified
registrar account data or an ongoing renewal quote. Add renewal owner,
payment recovery, registrar MFA/strong authentication, DNSSEC assessment,
and expiry alerts to the domain operations checklist.

Before enabling DNS records, decide the hosting/edge provider and origin
address. Use provider-recommended DNS values with a minimal record set. Avoid
publishing an origin address that bypasses the edge if the edge is intended
to enforce the perimeter. Protect registrar and DNS accounts with MFA and
separate recovery custody. Do not change live DNS as part of DPE-01.

Both hostnames need valid TLS coverage. Obtain and monitor certificates for
the canonical host and redirect alias from the selected edge/proxy. The
`.org` certificate is required even though it redirects, because TLS
negotiation occurs before the redirect response. Redirect HTTP to HTTPS, then
redirect HTTPS `.org` to HTTPS `.news`; avoid loops and test path/query
preservation, certificate renewal, canonical host validation, and direct
origin behavior. The current Next.js configuration emits
`Strict-Transport-Security: max-age=63072000; includeSubDomains`. Before
serving either registered domain, verify every affected subdomain is
HTTPS-ready and obtain owner approval for this two-year policy. If that
condition is not met, resolve the header policy through a reviewed
application/edge configuration change before public exposure; do not assume
the proxy silently overrides it. HSTS preload is not currently configured
and must not be enabled without a separate review and approval.

The app's `app/sitemap.ts` constructs sitemap URLs from
`MAYDAY_PUBLIC_BASE_URL` and lists the public homepage, publication index,
and currently public article slugs. `app/robots.ts` uses the same configured
base for `Sitemap:`. `app/layout.tsx` uses the configured base as Next.js
`metadataBase`; this alone does not prove an explicit canonical link element
is emitted. Set the production value exactly to
`https://thegoldenhorn.news`; verify metadata base, Open Graph URLs, any
declared canonical links, every sitemap entry, and robots sitemap reference
use that origin. Add no `.org` aliases to the sitemap. Keep staging on a
distinct hostname with
`MAYDAY_PUBLIC_INDEXING_DISABLED=true`, a `noindex` response/robots policy,
and a private perimeter; noindex alone is not access control.

For canonical indexing, publish only the `.news` hostname to crawlers after
the owner authorizes public launch and an editorial publisher explicitly
releases approved material. The `.org` redirect should not be indexed as a
duplicate site. Validate redirects, canonical tags, `robots.txt`,
`X-Robots-Tag`, sitemap responses, and released-only URL inclusion before
requesting indexing. Domain registration and deployment never constitute
editorial publication authorization.

If organizational email is later enabled on either domain, decide which
domain/subdomain is allowed to send mail and configure its MX, SPF, DKIM, and
DMARC records according to the selected mail provider before sending. Start
DMARC in monitoring/report-only mode (`p=none`) with an approved report
destination; review alignment and legitimate senders, then consider a staged
move to quarantine/reject only with explicit owner approval. Keep SPF to one
record per hostname and within DNS lookup limits; rotate/publish DKIM keys
per provider guidance. Do not add guessed MX/SPF/DKIM/DMARC records or claim
email authentication is operational until the provider and records are
selected and verified. Website hosting/TLS and domain ownership do not provide
mailboxes or deliverability.

## 4. Hosting alternatives

| Approach | SQLite and persistence | Complexity/control | Cost and scaling | Assessment |
| --- | --- | --- | --- | --- |
| Small dedicated VPS (recommended starting point) | Local SSD is a natural fit. One host and one container process match the current locking/WAL model. | Highest host-administration responsibility; full control of OS, firewall, local filesystem, Compose, proxy, and backup agent. | Budget roughly **US$25–50/month** for an always-on 2-vCPU/4-GiB-class host before backups, tax, identity, and domain. Verify exact region, transfer, backup, and tax rates when purchasing. Vertical scale is straightforward; host failure requires restore/failover. | Closest fit to the checked-in Docker/Compose path. Choose a provider/region based on operational support, legal/data location, backup isolation, and tested recovery rather than only the lowest price. |
| Managed container hosting with a guaranteed persistent disk (e.g. Render or Fly.io) | Potentially compatible only when the service stays a single instance attached to one persistent disk in the same region. Confirm filesystem semantics and SQLite/WAL support with provider documentation and a rehearsal. | Less OS upkeep, but platform-specific volumes, deploy rules, shell access, backup tools, egress/IP routing, and recovery constraints create provider dependency. | Budget **US$25–100+/month** for an always-on adequately sized service plus persistent disk, backups, and identity controls. This is a planning envelope, not a quote; small starter instances may be below the application's operational memory needs. | Consider if managed operations are valued enough to accept vendor-specific recovery and volume constraints. Do not scale to multiple instances over one SQLite file. |
| Existing organization-managed Linux/VM platform | Compatible if it provides a dedicated local persistent volume, single writer, independent encrypted backups, and operator access. | Can reuse existing patching, identity, network segmentation, backup, and alerting, but only if Dispatch remains a separate security boundary. | Marginal cost may be low when capacity is already funded; chargeback and support effort still exist. | Strong option if controls and isolation are demonstrably available without inherited Mayday credentials or authority. |
| Multi-instance serverless/container fleet | Typically uses ephemeral local disks or shared volumes with platform-specific semantics. | Simplifies horizontal scale but complicates SQLite consistency, leader/single-writer enforcement, and recovery. | Usage dependent and can include network, storage, and request charges. | Not recommended for the current architecture. Reconsider only after measured need and an intentional database/platform design change. |

The VPS range is an estimate, not an order or provider quote. DigitalOcean's
[Droplet pricing](https://www.digitalocean.com/pricing/droplets) and
[Volume pricing](https://docs.digitalocean.com/products/volumes/details/pricing/)
are examples of public price schedules to recheck at purchase time. Managed
service prices, availability, persistent-disk limitations, and regional
terms change; obtain a current quote and rehearse the exact region/plan before
selection. Provider-managed backup snapshots alone are not the independent
off-host backup strategy specified below.

## 5. Resource requirements

These are conservative starting allocations for the public web application
only. They are not measurements or a commitment about production traffic.
Research/analysis compute remains in separate upstream systems.

| Resource | Initial planning allocation | Reason / growth trigger |
| --- | --- | --- |
| CPU | 2 shared vCPU minimum; 2–4 vCPU preferred | Next.js serves pages/APIs and Node's synchronous SQLite API. Raise only after observing sustained CPU saturation or latency. Do not perform application builds on the production host. |
| RAM | 4 GiB recommended; 2 GiB is a constrained test floor | Allows OS, Docker, Node, SQLite page cache, and operational headroom. Observe peak resident memory and container OOM events before resizing. |
| OS/container | Supported 64-bit Linux server; Docker Engine and Compose plugin; Node 22 runtime in the image | Pin a supported OS/image line, install security updates, and rehearse upgrades. The official image currently uses Debian Bookworm slim / Node 22. |
| Host system disk | 40–60 GiB SSD | OS, container layers, logs, image rollback, temporary migration/restore files. Rotate logs and alert before capacity pressure. |
| Persistent application/database disk | Start with 20–50 GiB local SSD, dedicated mount, encrypted at rest where host supports it | SQLite database, WAL/SHM files, revisions, manifests, audit rows, and controlled future growth. Size from observed database growth; do not treat this as backup capacity. |
| Off-host backup capacity | Size from measured DB size and selected backup generations; initially assess 50–100 GiB for a small installation | Full independent copies and restore workspace may require substantially more than the live DB. Recalculate from actual DB size, retention, and verified compression/versioning behavior. No raw evidence file repository exists in the current app. |
| Network | Public ingress for HTTPS only; optional HTTP solely for ACME redirect/challenge; private/loopback app port | Permit only explicitly required outbound access for updates, backup, identity/perimeter, and operational dependencies. Upstream integrations call Dispatch inbound through separately restricted API routes. No database or Docker socket exposure. |
| Data transfer | Measure actual page, asset, and API use; begin with provider-included transfer or a modest allowance | No research workloads or large evidence downloads should be served by Dispatch. Alert on unexpected egress and do not add third-party analytics by default. |

Set operating-system/container storage alerts at approximately 70% (warning)
and 85% (urgent), and establish a response before launch. Database writes
must not continue into a full-volume condition without operator intervention;
do not delete WAL files manually to recover space.

## 6. Network and security perimeter

### Public and private entry

- Public visitors receive only the canonical public website over HTTPS.
- The reverse proxy terminates TLS, redirects HTTP to HTTPS, limits request
  rate/body size/timeouts, sets a canonical host policy, and forwards to the
  application over loopback/private networking.
- The host firewall admits 443 publicly and 80 only if required for
  certificate validation/redirect. SSH and host administration are limited
  to a private management network or controlled administrative IPs with
  individual keys, MFA at the access provider, no password/root login, and
  audited access.
- The application container port is not exposed on a public interface.
  Restrict Docker socket access to trusted host administrators.
- Protect `/editorial`, `/editorial/*`, and human operations UI/API with an
  organization-controlled MFA identity perimeter. Preserve Dispatch's
  application session and authorization checks behind that gate.
- Machine integration endpoints require their own TLS API route policy,
  per-application credentials, request limits, rate/abuse detection, and
  optional source IP restrictions only where upstream egress addresses are
  stable and documented. Do not disable API credential verification to
  accommodate an edge provider.
- Public endpoints remain public by design, but unauthenticated mutation
  routes remain denied. Never use robots/noindex as an access control.

### Proxy contract and headers

Before deployment, specify and test exactly how the proxy preserves the
canonical external `Host` and HTTPS scheme. It must discard client-supplied
`Forwarded`, `X-Forwarded-Host`, and related trust headers, then write its own
trusted values. The application must compare editorial request origins to
the canonical request origin; arbitrary forwarded-host values must not turn
into trusted origins. Verify this with requests through the actual proxy.
Proxy and application security headers must not conflict. The application
currently emits a two-year HSTS policy with `includeSubDomains`; confirm the
policy is appropriate for both registered domains and all their subdomains
before DNS cutover as described above.

The app currently sets CSP, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, and HSTS. Confirm the deployed proxy
does not replace or weaken them. TLS certificates may use ACME/Let's Encrypt
or the chosen edge provider's managed certificates; certificate renewals
must be monitored.

### MFA and sessions

The signed editorial session is a Dispatch authorization mechanism, not an
identity perimeter and not MFA. The chosen identity provider/access gateway
must require MFA for publisher/operator access, enforce short and revocable
human access, and provide an incident disable path. It must not grant a
publisher role: that role exists only in Dispatch's protected server-side
credential configuration and remains subject to the explicit release
workflow. Do not rely on an edge identity assertion as a substitute for the
app's session signature or role check.

Application logs are content-free by design but contain operational IDs,
actor application names, request/correlation IDs, and errors. Proxy access
logs may also contain client IPs, paths, and timing. Restrict readers, minimize
fields, set a documented retention period, and review the privacy notice for
the selected provider's logging/retention behavior before launch.

## 7. Institutional trust boundary

```text
Research Studio -- external-application draft submission -->|
Overwatch       -- external-application draft submission -->| Dispatch API
Mayday3         -- external-application evidence registry -->| (TLS + scoped
                                                            | credentials)
                                                            v
                                               Dispatch editorial review
                                                            |
                                       explicit publisher + exact revision
                                                            |
                                                            v
                                                   public snapshot

Deployment pipeline -- build/test artifact; no publisher identity
Host operator       -- deploy/recover; separate operator identity
Lockdown operator   -- lockdown only; no publisher/admin role
```

Production credentials must never authorize administration of Mayday1, Mayday2,
Mayday3, Citadel, Aegis, future Warden/Sentinel systems, or independent
OSS/Guild infrastructure. Integration credentials should be individually
rotatable and limited to a named integration and its permitted gateway
actions. Do not provision inbound administrative credentials or broad
network connectivity to those environments on the public Dispatch host.

Dispatch's public-host compromise can expose Dispatch configuration, its own
database, and any integration credentials mounted there; this is a real
residual risk. Reduce blast radius with individual low-scope credentials,
network egress allow-listing where practical, rapid revocation, secret
rotation, and no shared Mayday administrator credentials. The compromise
must not itself grant a publisher credential or direct control of upstream
systems. An upstream compromise can submit or alter permitted material for
its own origin but cannot release it: only the separately authenticated
Dispatch publisher can publish an exact reviewed revision. Never place
proprietary source intelligence in Dispatch backups or logs merely because
upstream systems can submit references or permitted derivatives.

## 8. Development, staging, and production separation

| Environment | Data and identity | Reachability and release policy |
| --- | --- | --- |
| Development/test | Local/disposable SQLite, synthetic fixtures, development-only credentials or test identities. | Developer-controlled. Fixtures stay in development; no production credentials. |
| Private staging | Dedicated database and persistent volume, distinct staging application/session secrets, nonproduction content, distinct hostname and environment label. | VPN/identity-gated, indexing explicitly disabled (`MAYDAY_PUBLIC_INDEXING_DISABLED=true` plus edge `noindex`/access control), no confidential client material, no production publishing authority, no connection to production data. |
| Production | New production database, independently generated secrets and credentials, explicitly selected canonical HTTPS URL, restricted production identities. | Public reads only; human editorial/operations access protected by MFA perimeter. Explicit deployment and publisher release only. |

Use separate Compose projects, volume names, secret files, ports, and
environment files. The existing `compose.staging.yaml` binds only to
`127.0.0.1:3001` and uses named staging volumes. A production Compose
configuration must be separately reviewed; do not reuse staging values,
volumes, or secrets. Staging robots settings are not a substitute for its
private network/identity gate.

The app's production launcher forces `NODE_ENV=production`; production does
not seed development fixtures. Empty production databases should show empty
public states until an explicitly manifested release exists. Test cold start,
search, sitemap, restore, and empty-state behavior in staging before cutover.

## 9. SQLite and persistent storage

Keep the active database at an absolute path such as
`/var/lib/mayday-dispatch/mayday-dispatch.sqlite`, on the host's local
SSD-backed persistent filesystem, mounted at the container's existing
`/var/lib/mayday-dispatch` state path. The `dispatch` UID/GID (1001) in the
container must have only the necessary read/write access to the database
volume; host secret files must be readable only by the deploy/runtime
identity that needs to mount them. Verify actual ownership and mode inside the
chosen Compose runtime.

Never locate the live DB under Git, a container writable layer, a publicly
served path, OneDrive/synced desktop folders, a shared multi-host network
filesystem, public asset storage, or backup storage. WAL/SHM files live next
to the database. Keep one running app process per database file; do not start
a second replica or concurrent migration process. The production launcher
uses an exclusive process lock and readiness checks, but that lock is
host-local and is not distributed coordination.

Apply migrations as a separately initiated maintenance step while the
application is stopped, after a verified consistent pre-migration backup.
Then check migration status and health before starting the app. Startup
checks compatibility/readiness but does not run migrations. Migration 008
adds release manifests and indexes; older application rollback is unsafe
after new editorial writes/releases and can ignore manifest/withdrawal
semantics. Follow [publication-release.md](./publication-release.md) and
[production-runbook.md](./production-runbook.md) for recovery constraints.

Monitor database size, WAL growth, disk free space, health/readiness, and
write failures. Define an on-call action for disk pressure before launch.
SQLite migration to a client/server database should be considered only if
measured concurrent writers, availability requirements, data volume, or
multi-host scale exceed this design, and only with a tested data migration
and equivalent release/lockdown/audit semantics. No such migration is part of
DPE-01.

## 10. Backup and recovery

| Data class | Current location/meaning | Required handling |
| --- | --- | --- |
| Live database | SQLite file plus its WAL/SHM state on local persistent disk. | Never copy a live `.sqlite` file with a plain file copy. Use `npm run db:backup` (SQLite `VACUUM INTO`) for a consistent standalone backup. |
| Database backup | Consistent copy containing editorial revisions, evidence metadata/references, audit events, release manifests/snapshots, and lockdown state. | Encrypt client-side before transfer; upload over TLS to a separate account and preferably separate provider/region. Restrict deletion and access; verify integrity/schema after restore to a new path. |
| Public static assets | Source-controlled `public/` assets in the deployment image at present. | Retain the source commit/image digest. Future public-only uploaded assets require a separately governed versioned backup/publish process. |
| Private source/evidence material | No managed upload/blob store is implemented by this application. | Do not add copies to Dispatch backup storage as a convenience. Back up only data the Dispatch service is authorized to retain. |
| Configuration | Nonsecret Compose/OS/proxy/monitor configuration and operational runbooks. | Version controlled after secret scan and review; archive the exact deployed config and image reference. |
| Secrets/recovery keys | Host files / provider secret facilities, not database content. | Separate access-controlled secret store or encrypted operator vault, documented rotation and recovery access. Never put secrets in Git or ordinary backups. |

Proposed initial policy, subject to owner approval:

- One consistent encrypted backup daily and one immediately before every
  production migration or planned deployment that changes schema.
- Keep 14 daily, 8 weekly, and 6 monthly generations initially, with deletion
  protection for a short recovery window if the chosen provider supports it.
- Verify upload/checksum after each backup; run SQLite integrity and schema
  checks on restored copies. Perform a full isolated restore quarterly and
  after material backup/restore changes.
- Start with **proposed**, not adopted, objectives of RPO 24 hours and RTO
  one business day. A pre-migration backup lowers migration rollback loss but
  does not itself improve the routine RPO. Owners must approve realistic
  service objectives and recovery staffing.
- If backups are independent full copies, the retention above can require up
  to approximately `28 × D` before compression and temporary restore space.
  Estimate actual retained capacity from the measured database size and
  verified compression/versioning/deduplication behavior; do not assume
  incremental storage savings, unlimited retention, or provider object lock.
  Start with 50–100 GiB only when the measured database size and chosen
  retention method fit that capacity.

Cloudflare R2's official [pricing documentation](https://developers.cloudflare.com/r2/pricing/)
lists Standard storage at US$0.015/GB-month, with a free monthly allowance
for 10 GB-month and specified operations, and no Internet egress charge at
the time checked (2026-09-27). This is an example of an object-backup cost
input, not a selected service; storage/operation rates and contractual
features must be rechecked. R2 is not a live SQLite volume.

## 11. Deployment integrity

Every production deployment should have a human-approved record containing:

1. Git commit SHA and clean-source/build provenance.
2. Immutable container image digest, build identifier, and application
   version (`package.json` currently reports `0.1.0`).
3. Image build time and build system identity.
4. Target environment and configuration revision, without secret values.
5. Database schema/migration version before and after deployment.
6. Deployment initiation time, responsible deployer, approval reference, and
   previous image/config/database backup reference.
7. Health/readiness result and smoke-test outcome after deployment.
8. Whether rollback remains application-only safe or requires restoring a
   pre-deployment database to a new path.

CI may lint, typecheck, test, audit dependencies, build, and publish an
immutable artifact to a registry. CI must not receive publisher or operator
credentials. Production deployment must be a separately protected, explicit
human action. Database migration is separately initiated with a verified
backup; app start never makes a publication decision. No import, background
task, migration, sync, successful build, or deployment can release editorial
content. Preserve snapshot manifests, audit rows, and lockdown state when
restoring.

Use a controlled image promotion path: build once, scan/test the exact image,
promote its digest, rehearse in private staging, and explicitly approve the
production rollout. Keep the previous known-good image and a verified
pre-migration database backup. Never treat container rollback as database
rollback.

## 12. Monitoring and incident response

Use provider/host monitoring independent of the application process. Begin
with a low-volume uptime check on public availability plus private monitoring
of `/api/health`, host/container health, and backup age. Alert on:

- public availability and elevated 5xx/latency;
- database unreachable, degraded health, or migration incompatibility;
- filesystem/database/WAL growth and available storage thresholds;
- container restart loops, OOM kills, and host security updates;
- missing or failed backups, integrity failures, and restore-test failures;
- repeated authentication failures, invalid credentials, or suspicious
  request-rate changes;
- publication releases/updates, unauthorized release attempts, lockdown
  activation/deactivation, and unexpected operator actions;
- deployment start/result and failed post-deployment checks.

Keep alert payloads content-free: no publication body, source/evidence text,
request body, credential, or private notes. Treat application IDs and
correlation/request IDs as restricted operational data. Review proxy logs
separately for IP collection, access, retention, and privacy disclosure.
Avoid invasive third-party analytics and do not send acquired research or
evidence to external telemetry vendors.

For suspected Dispatch compromise: restrict public exposure at the edge,
preserve logs and the database for investigation, activate publication
lockdown through the separate authorized operator path if trustworthy,
revoke Dispatch integration/editorial credentials, and restore only after
integrity and trust are re-established. Notify independent upstream owners
through their own channels; do not use the Dispatch host's authority to
administer their systems. A site incident does not transfer or expand
publication authority.

## 13. Preliminary operating-cost inventory

These are planning envelopes in USD, not quotes, expenditures, or approved
budgets. They exclude taxes, currency conversion, staff/on-call labor, legal
work, and traffic/storage beyond assumptions. Verify current rates and terms
for the selected region/plan before commitment.

| Cost | Preliminary monthly estimate | Annualized estimate | Essential/optional and assumptions |
| --- | ---: | ---: | --- |
| Always-on host/container compute | $25–50 | $300–600 | Essential. Target is a modest 2-vCPU/4-GiB Linux host. Managed container offers may differ materially. |
| Separate encrypted off-host backup storage | $2–15 | $24–180 | Essential. Small DB, 50–100 GiB starting allocation; storage, operations, retrieval, version retention, and encryption tooling vary. |
| Domain and DNS | $0–4 equivalent recurring | $0–48 recurring | The owner reports US$14.81 already paid for both one-year registrations through Spaceship effective 2026-09-27. That is a sunk initial registration expense, not a monthly cost or verified renewal rate. DNS service may be included/free or paid; provider and renewal pricing remain to be verified. |
| TLS certificate | $0–10 | $0–120 | Essential capability, but may be included with edge/hosting service or use automated ACME. Paid managed certificate/edge products are optional. |
| MFA identity/perimeter | $0–50+ | $0–600+ | Essential control, not optional in effect. Cost depends on user count, MFA policy, SSO requirements, access gateway, and existing organizational licenses; obtain a quote. |
| Availability/error/backup monitoring | $0–20 | $0–240 | Essential monitoring outcome; basic checks may be included in existing infrastructure/free tiers. Paid alert retention/SLA optional. |
| Contact/email delivery | $0 until chosen | $0 until chosen | Not essential to operate current app routes; required only if a real monitored contact destination or transactional email is approved. |
| Public asset service | $0 initially | $0 initially | Current application serves source-controlled static assets; it has no upload/object-asset subsystem. Budget separately if a requirement is approved. |

Indicative recurring launch envelope: approximately **$27–150/month** or
**$324–1,800/year**, including a possible paid DNS service, but excluding
the already-reported US$14.81 initial domain registrations. This wide estimate
reflects unknown identity/perimeter plan, backup retention, and monitoring
choices. Existing organization-funded
compute, MFA, DNS, certificates, or monitoring may reduce incremental cash
cost, but not operating/control obligations. Optional WAF, premium SLA,
longer log retention, commercial support, and higher availability can
increase it. Scaling costs should be estimated only from measured demand.

Pricing reference checked 2026-09-27: domain-registration cost as reported
by the owner (Spaceship; renewal pricing not verified),
[DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets),
[DigitalOcean volume pricing](https://docs.digitalocean.com/products/volumes/details/pricing/),
[Render pricing](https://render.com/pricing),
[Fly.io resource pricing](https://fly.io/docs/about/pricing/),
and [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).
Provider pages and offers are dynamic. The amounts in the table are
deliberately broader planning estimates, not vendor-verified quotes; obtain
current, region-specific pricing for host, disk, backups, data transfer,
identity, and support before approval. No service has been ordered.

## 14. Outstanding decisions

The service owner and relevant legal/security stakeholders must decide:

- hosting provider, region, operating responsibility, support/SLA, and
  administrator/on-call ownership;
- verify registrant and renewal records for the reported Spaceship domains;
- DNS/edge provider, DNSSEC, canonical DNS targets, `.org` redirect
  implementation, TLS coverage/renewal, and origin-address protection;
- confirm `MAYDAY_PUBLIC_BASE_URL=https://thegoldenhorn.news` for production,
  the canonical metadata/sitemap/robots behavior, and the launch-time
  indexing decision;
- decide the organization's mail provider, sending domain, MX, SPF, DKIM,
  DMARC reporting destination/policy, and whether any email service is needed;
- MFA-capable identity perimeter, eligible users, emergency access, and
  access logging/retention;
- whether editorial browser paths and operational controls share an edge
  policy, and how upstream API paths are separately restricted;
- production database owner, volume encryption, disk/backup capacity, and
  storage exhaustion response;
- off-host backup provider/account/region, encryption/key custodians, retention,
  deletion protection, and approved RPO/RTO;
- monitoring/alert destinations and privacy/log-retention notices;
- contact destination and any email provider only if the organization
  approves a monitored contact workflow;
- legal entity, jurisdiction, terms/privacy disclosures, data classification,
  source/rights boundaries, and real editorial candidates;
- image scanning, patching cadence, emergency update authority, deployment
  sign-off, and restore-test owner.

Until these are resolved and verified, production is not configured and
public launch remains unauthorized.

## 15. DPE-02 implementation sequence

1. Obtain approvals for provider/region, DNS/edge and redirect plan, identity/
   perimeter, service objectives, backup location/retention, privacy logging,
   canonical `.news` configuration, and operators. Do not change DNS until
   separately authorized.
2. Create an isolated private staging host/environment with no production
   credentials, database, content, or publisher authority. Confirm external
   access is gated and indexing disabled.
3. Build and scan the existing container; record its immutable digest. Verify
   container UID, volume mount ownership, read-only secrets, health check,
   restart behavior, and no public app port.
4. Configure DNS and the `.org`-to-`.news` permanent redirect only after
   explicit authorization. Verify valid TLS for both names, canonical host/
   forwarding behavior, MFA human access, rate/body limits, API route policy,
   logging, firewall, and certificate renewal. Exercise origin spoofing and
   direct-origin bypass tests. Confirm DMARC/SPF/DKIM only if email sending
   has been separately approved.
5. Run explicit migration and startup against a disposable staging database.
   Verify health and empty states; ensure no development fixture or private
   evidence leakage through homepage, article, search, sitemap, or restore.
6. Use disposable staging credentials and content to exercise upstream draft
   submission, editorial review, readiness remaining private, explicit
   publisher release, exact manifest/snapshot, and audit history.
7. Activate lockdown, verify all release/update paths reject, restart the
   service, verify lockdown persists and the prior snapshot remains, then
   deactivate only through the separately authorized operator identity.
8. Exercise credential rotation/revocation, MFA, role separation, session
   logout/expiry, request throttling, public/private route policy, and
   operator access.
9. Test encrypted off-host backup, independent restore to a new location,
   integrity/schema/manifests/audit/lockdown checks, and documented rollback
   of the exact image/database combination.
10. Simulate disk pressure, failed backup, app crash, unavailable host, and
    invalid migration; verify alerts, runbooks, recovery staffing, and
    publisher authority remain separate.
11. Record test evidence, unresolved findings, current cost quote, named
    control owners, and a go/no-go decision. DPE-02 must remain private
    staging; it does not authorize public deployment or editorial release.

## 16. DPE-02 acceptance criteria

DPE-02 is acceptable only when the selected staging deployment demonstrates:

- a reproducible, scanned immutable container artifact and traceable
  deployment record;
- canonical HTTPS responses, sitemap/robots/metadata limited to
  `thegoldenhorn.news`, a valid TLS redirect from `thegoldenhorn.org`, and
  verified path/query-preserving redirect behavior;
- a single app instance using a persistent local database volume, with
  independent staging credentials and no production data/secrets;
- verified TLS, canonical-host/proxy behavior, public/private path policy,
  MFA for human editorial/operations access, request limits, firewall, and
  restricted logs;
- separate integration, editor, publisher, operator, deployer, and public
  trust roles; no CI or upstream publisher authority;
- successful explicit migration/startup/health checks and clean empty state;
- ingestion remains private until authorized publisher action; release
  manifest binds the exact revision; public content is the verified snapshot;
- lockdown blocks all new release/update paths, survives restart, and does
  not hide prior released material;
- consistent encrypted off-host backups and successful independent restore
  of revisions, evidence metadata, audit, manifests, and lockdown;
- a rehearsed rollback compatible with migration history, alerting, incident
  procedure, and named recovery owners;
- zero development fixture leakage and no exposure of database, backup,
  secret, or private evidence storage;
- approval of outstanding security, privacy, legal, content, cost, and
  operating decisions before any later public launch work.

Passing DPE-02 staging checks alone does not constitute authorization to
deploy publicly or release material.
