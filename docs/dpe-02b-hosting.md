# DPE-02B1 hosting selection and deployment preparation

**Status: proposal only; no provider selected, purchase made, DNS changed,
secret transferred, or infrastructure provisioned.** This document prepares
the first private hosted staging deployment. It does not authorize external
exposure, production deployment, or publication.

## 1. Evidence and scope

The repository was clean at the start of this work and `HEAD` was
`11f8487b9defec5d5a48f15c306d3138de298bdd`
(`Complete Dispatch DPE-02A local staging and operational rehearsal`).
The retained [DPE-02A rehearsal](./dpe-02a-staging-rehearsal.md) and
[DPE-01 infrastructure plan](./production-establishment.md) are the source
for the observations and constraints below.

DPE-02A exercised the production-mode Node 22 / Next.js standalone
container, Compose, non-root runtime, one SQLite database, migrations,
publication lifecycle, health checks, restart, backup/restore, and several
bounded failure cases. It did so on a private local Docker Desktop Linux
engine using synthetic records and disposable staging credentials. It did
not test a VPS, provider volume, public ingress, an external identity
provider, real TLS/DNS, off-host backup, production credentials, production
data, or production-scale load. The staging project remains local, loopback
bound, synthetic, and locked down. Its ignored environment file and secret
files must not be copied into a hosted environment.

Measured container memory was about 70–82 MiB and sampled CPU was 0–0.82%
during limited synthetic traffic. These are point-in-time workstation
observations, not workload capacity, host requirements, or a production
baseline. Keep the conservative DPE-01 starting size until private hosted
measurements and failure tests justify a change.

## 2. Hosting recommendation and requirements

### Recommended initial configuration

Use one supported 64-bit Linux VPS in an owner-approved jurisdiction and
region. Run one Dispatch app container with Docker Engine and Compose; keep
one app process and one SQLite writer. Use a host-managed HTTPS proxy and
local SSD-backed storage. Do not run application builds on the production
host. Deploy only an immutable, tested image digest.

| Resource | Preparation target | Constraints |
|---|---|---|
| Compute | 2 shared vCPU minimum; start at 2 vCPU / 4 GiB RAM | 2 GiB is only a constrained test floor, not the selected default. Re-size from observed host/container memory, CPU saturation, latency, and OOM evidence. |
| System disk | At least 40–60 GiB SSD | OS, Docker layers, logs, and one previous known-good image. Apply log rotation and capacity alerts. |
| Persistent application data | 20–50 GiB local SSD-backed filesystem or dedicated local mount to start | Store SQLite and its WAL/SHM files here. Confirm provider persistence, encryption-at-rest options, resize behavior, and restore behavior. This is not backup storage. |
| Backup repository | Initially assess 50–100 GiB separately from live data | Final size follows database size and retention. For independent full copies, 14 daily + 8 weekly + 6 monthly generations can require up to 28 times the database size before compression and restore workspace. |
| Network | Private app listener; public web ports only after a distinct launch authorization | No public SSH, database, Docker socket, host admin panel, or editorial origin. Use overlay/VPN or identity-gated access for authorized human operators. |
| Runtime | Docker Engine + Compose plugin; Node 22 Bookworm-slim app image | Pin the app image digest and approved base-image line. Runtime launcher checks credentials, database writability, migration readiness, and its single-process lock. Migrations remain explicit. |

The application's current persistence model is a one-host SQLite database
using WAL and a process lock. A network share, shared multi-host volume,
serverless ephemeral disk, or multi-instance Compose service is not a
compatible substitution. Do not add a managed database, horizontal replicas,
or public upload store without a separate architecture decision.

### Hosting alternatives

1. **Small VPS — recommended.** Closest match to checked-in Compose; clear
   control of local SSD, firewall, proxy, and backup agent. It requires an
   accountable operator for OS patching, monitoring, recovery, and access
   hygiene. Host failure requires restore or a separately rehearsed rebuild.
2. **Existing organization-managed Linux VM — acceptable if verified.**
   Prefer when an isolated local persistent filesystem, support/on-call,
   independent encrypted backup, MFA access, and clean separation from
   unrelated Mayday systems are already available and demonstrated.
3. **Managed container service with a guaranteed persistent disk — optional
   alternative.** Accept only after its exact region/volume is tested with
   SQLite WAL, a single instance, backups, explicit migrations, private
   access, and restore. Platform deployment rollback must not imply database
   rollback.
4. **Multi-instance/serverless fleet — not suitable now.** Ephemeral/shared
   storage and concurrent writers conflict with the present persistence
   design.

The purchase comparison must include support and recovery responsibilities,
local disk semantics and price, transfer limits, backup isolation, regional
availability, administrator MFA, and cost to restore—not just CPU/RAM price.

## 3. Linux directories and persistent volumes

Proposed host layout (create only after a separate deployment instruction):

```text
/opt/mayday-dispatch/
  compose.yaml                 # reviewed, non-secret deployment definition
  .env.production              # paths and non-secret runtime configuration
  release-record.json          # image digest and deployment metadata; restricted
/etc/mayday-dispatch/secrets/
  application-credentials.json # separately generated production credential hashes
  session-signing-key          # independent production session key
/srv/mayday-dispatch/data/     # dedicated local SSD filesystem/mount
  mayday-dispatch.sqlite       # active database, owned for UID/GID 1001
  mayday-dispatch.sqlite-wal   # SQLite-managed; do not remove manually
  mayday-dispatch.sqlite-shm   # SQLite-managed; do not remove manually
/var/backups/mayday-dispatch/  # optional encrypted-transfer scratch only
```

Mount `/srv/mayday-dispatch/data` at the container's existing
`/var/lib/mayday-dispatch`; configure
`MAYDAY_DATABASE_PATH=/var/lib/mayday-dispatch/mayday-dispatch.sqlite`.
Run the container as its existing unprivileged `dispatch` UID/GID 1001 with
only the required database-volume permissions. Do not put live data in a
container writable layer, Git/OneDrive checkout, public web root, object
storage, or a volume shared with another host.

The `/var/backups` path is not the backup of record. Do not leave unencrypted
database copies there. Encrypt before off-host transfer; remove any approved
temporary plaintext restore copy after verification. Keep secrets outside
the image, Compose source, data volume, and backups. Restrict
`/etc/mayday-dispatch/secrets` to the host account that must mount them;
keep a recovery copy only in an organization-approved encrypted vault with
separate custodianship.

Host root, Docker access, and database-volume access are privileged control
planes. Restrict each to named operators, MFA-backed administration, and
audited access. File permissions do not protect against a fully privileged
host administrator.

## 4. Private ingress, proxy, identity, and routes

Nothing is exposed by this preparation. During the first hosted rehearsal,
keep the host and app private: no public DNS, public inbound firewall rule,
public tunnel, or unauthenticated internet route. Authorized testers reach
the site only through a separately approved VPN/overlay or identity-aware
access gateway that enforces MFA and defaults to deny. The existing
`compose.staging.yaml` loopback binding is a useful local pattern, not a
hosted perimeter.

For a later explicitly approved public service, the intended routing model
is:

```text
Public readers -- HTTPS --> edge/reverse proxy -- private HTTP --> 127.0.0.1:3000
Authorized editors/operators -- MFA access gateway/VPN --^
Upstream integrations -- separately limited HTTPS API policy --^
```

The host application port stays on loopback or a private container network;
never publish it on a public interface. The host firewall should deny by
default. At a future public cutover, allow only HTTPS to the proxy and HTTP
only for redirect/ACME validation if needed. SSH is not a public service:
use a management overlay or a small approved administrator IP allowlist,
individual SSH keys, MFA at the access provider, no password/root login,
and audited sessions. Do not expose Docker's socket or a database port.

The proxy must:

- terminate TLS, redirect HTTP to HTTPS, enforce an explicit host allowlist,
  and apply reasonable request-size, timeout, and rate limits;
- remove caller-provided `Forwarded`, `X-Forwarded-Host`, and related trust
  headers, then set its own trusted scheme/host values;
- preserve the canonical HTTPS origin used by `MAYDAY_EDITORIAL_ORIGIN`,
  without letting arbitrary forwarded headers satisfy Dispatch's exact
  `Origin` checks;
- preserve rather than weaken application CSP, HSTS, frame, content-type,
  referrer, and permissions headers; test for duplicate/conflicting headers;
- expose only routes intentionally assigned to each audience.

The editorial UI and human operations endpoints are private surfaces, not
public site content. Require MFA through an organization-controlled identity
perimeter, short/revocable human access, audited access, and an emergency
disable path. Retain Dispatch's own signed session, exact-origin validation,
and role checks; the gateway assertion is not a Dispatch session or role.
Keep public editorial sign-in disabled at the perimeter.

Machine integrations must not use the human MFA flow. If a future deployment
needs inbound integration traffic, give each integration a separate HTTPS
API route policy, rate/abuse limits, and its own production credential.
Use source-IP restrictions only where upstream egress ranges are stable and
confirmed. Do not route integration credentials through the public editorial
UI. Staging integrations use synthetic/nonproduction identities and no
publisher role.

The deployment/build pipeline may build, test, scan, and attest artifacts.
It must have no Dispatch publisher credential, no editorial session key, no
database write access, and no ability to publish. Do not create an automatic
production deploy workflow as part of this task. An explicitly authorized
human deployment operator promotes a digest; that identity is not a
Dispatch publisher or editor. A separate named Dispatch publisher performs
any future content release through the normal reviewed application
workflow. The Dispatch operator may manage lockdown but cannot publish.
Host administrators remain technically privileged and are not represented
as application publishers.

## 5. Production/staging separation

Keep development, private staging, and production independent in all of:

- Compose project, host/volume names, database, hostname, environment file,
  secrets, session key, identity-provider group, and backup repository;
- integration bearer tokens and credential hashes, editor/publisher/operator
  identities, monitoring destinations, and log access;
- data and authority: no production database, genuine research material,
  source intelligence, production secrets, or publisher role in staging.

Generate production credentials independently; do not copy, reuse, or
transfer the retained local `.env.staging`, staging secret files, staging
database/volumes, or test cookie/session values. Store bearer plaintext only
in the relevant upstream/organizational secret store and store the applicable
hash or supported secret in the protected production credential file.
Use distinct high-entropy values for every integration identity and a
separate session-signing key. Rehearse rotation and revocation. Set
`MAYDAY_PUBLIC_BASE_URL=https://thegoldenhorn.news` and
`MAYDAY_EDITORIAL_ORIGIN=https://thegoldenhorn.news` only in a future
explicitly approved production configuration. Staging must remain
`MAYDAY_PUBLIC_INDEXING_DISABLED=true` behind the private access perimeter.

The pipeline can publish an artifact to an approved registry but cannot
operate Dispatch or release content. A named human must approve the image
digest and deployment record. Migration, backup, deployment, and publication
are separate actions. Take a verified backup before any schema-changing
migration; run migration explicitly while the app is stopped and verify
compatibility before startup.

## 6. Backup and recovery proposal

Use the application's `npm run db:backup` / `npm run db:restore` utilities,
not a plain copy of the live SQLite file. DPE-02A's local synthetic backup
restored successfully and passed SQLite integrity/schema checks; this did not
test remote encryption, retention, failure alerts, or recovery objectives.

Proposed controls, subject to owner approval:

1. Produce a consistent backup daily and immediately before any
   schema-changing migration or planned deployment requiring one.
2. Encrypt client-side before transfer using an approved backup tool. Store
   the key/repository recovery material in the organization's encrypted
   vault, separate from both the host and backup account.
3. Send to a separate account and preferably provider/region with restricted
   write/read identities, version retention, deletion protection, and
   provider object-lock/immutability if appropriate and available. Do not use
   the same VPS volume or provider snapshot as the only recovery copy.
4. Keep the DPE-01 proposal of 14 daily, 8 weekly, and 6 monthly generations
   only after sizing actual database growth and reviewing legal retention.
   Verify upload/checksum and alert on missing/failed backups and stale
   recovery points.
5. Quarterly and after material backup changes, decrypt a selected backup
   into an isolated new location. Restore to a **new** database path, run
   `PRAGMA integrity_check`, `npm run db:status`, and compare expected schema,
   release manifests/snapshots, audit history, and lockdown state. Never
   overwrite the active database during a test.

Recovery sequence: restrict traffic; record incident and target restore
point; stop only the Dispatch Compose service; retrieve and decrypt the
verified backup; restore it to a new local database path; verify integrity,
schema/migrations, release manifests, audit history, and lockdown; select a
compatible image digest; update the reviewed config to point at the restored
path; start one app instance and check health privately; then obtain
independent service-owner and publisher decisions before reopening any
routes. Preserve the failed database and logs for investigation. Do not
claim application rollback is database rollback, reverse migrations
automatically, or reopen publication merely because health is green.

Use **proposed, unapproved** objectives of RPO 24 hours and RTO one business
day as planning placeholders. The owner must select achievable objectives,
retention, key custodians, restore authority, and recovery staffing before
acceptance.

## 7. Integrity records and restricted monitoring

For every candidate/released artifact, prepare a restricted deployment
record with:

- source commit (`11f8487b9defec5d5a48f15c306d3138de298bdd` is this
  preparation baseline), clean/dirty source state, build time and builder;
- dependency lockfile hash, image name and immutable digest, vulnerability
  scan/test results, and provenance/signature or registry attestation;
- non-secret Compose/proxy configuration version and checksum; never store
  secret values or secret-file hashes in a broadly accessible manifest;
- migration/schema version and explicit backup identifier/checksum;
- approver, deployment operator, timestamp, previous known-good image digest,
  health outcome, and follow-up/rollback result.

Keep the record in an access-controlled append-only location or protected
change record. Retain enough history to identify exactly what code,
configuration, image, schema, and backup were in use without recording
publication or research content.

Enable host/provider and container monitoring independent of the application
process: host availability, container restart/OOM, disk and database/WAL
growth, `/api/health` readiness from a private monitor, external public
uptime only after explicit public launch, backup success/age, restore-test
status, TLS expiry, security updates, and deployment result. Initial disk
alerts: 70% warning and 85% urgent. Page on health/database degradation,
backup failure or staleness, low disk, restart loop/OOM, certificate
renewal failure, unexpected authentication rates, or unapproved release/
lockdown activity.

Application and proxy log access is restricted to named operators. Set
minimum necessary fields and an owner-approved retention period before
deployment. Alert payloads and telemetry must exclude publication body,
private notes, source/evidence content, request bodies, bearer/session
secrets, and database paths. Treat actor names, IPs, and correlation/request
IDs as restricted operational data. Do not send genuine research material
to a general-purpose telemetry vendor.

## 8. Domains, DNS, TLS, and HSTS review

No live Spaceship DNS is changed by this preparation. The organization
reports that both registrations are active; account ownership, recovery
custodians, renewal dates/prices, and DNS settings still need owner
verification.

| Host | Future role | Required behavior after explicit authorization |
|---|---|---|
| `thegoldenhorn.news` | The only canonical publication host | Provider-selected DNS to the chosen edge/origin; HTTPS service; production base URL exactly `https://thegoldenhorn.news`; only this host in metadata, sitemap, and canonical links. |
| `thegoldenhorn.org` | Redirect-only alias | Valid TLS first, then permanent 301/308 to matching `.news` path and query. Do not serve a duplicate site or list `.org` URLs in the sitemap. |

Before cutover, select the edge/DNS provider and verify its exact A/AAAA/CNAME
requirements. Publish AAAA only if IPv6 ingress and firewall policy are
implemented and tested. If an edge/CDN is used, proxy origin traffic and
allow only the edge to reach the origin where supported, preventing direct
origin bypass. Test direct-origin behavior. Use a short TTL (for example,
300–600 seconds) only during an authorized planned cutover; do not change
records now. Enable DNSSEC only after supported-provider and registrar DS
values are verified. Add CAA only if certificate issuance policy is selected
and tested. Do not add mail records until an email provider and sending
purpose are approved.

Obtain valid certificate coverage for both exact hostnames. HTTPS negotiation
to `.org` happens before its redirect. Use provider-managed certificates or
automated ACME with monitored renewal and narrowly scoped DNS challenge
credentials if DNS-01 is required. Test TLS chain, expiration monitoring,
HTTP-to-HTTPS, path/query-preserving `.org` redirect, canonical host, proxy
headers, origin protection, and renewal. No TLS certificate or DNS record is
created here.

### HSTS is a pre-DNS blocking gate

The current [Next.js configuration](../next.config.ts) emits
`Strict-Transport-Security: max-age=63072000; includeSubDomains` on all
application paths. DPE-02A observed it over loopback only. The two-year
`includeSubDomains` directive affects browser behavior for descendants of
each hostname that serves that header; an HTTPS site or redirect on the
apex does not prove every existing/future subdomain is HTTPS-ready. Both
domain trees, any delegated subdomains, and any planned services/email
endpoints must be considered.

**Do not point either public DNS name at a serving endpoint until the owner
has inventoried affected subdomains and either approved continued
`includeSubDomains` on the evidence that every affected host supports HTTPS,
or approved a reviewed application/proxy policy change and verified the
resulting response headers.** The proxy must not silently strip, weaken, or
duplicate HSTS. HSTS preload is not configured and is prohibited without a
separate review and approval. This decision is open; no header policy is
changed in DPE-02B1.

## 9. Purchasing checklist and cost envelope

Do not purchase in DPE-02B1. Before a separate purchasing authorization:

- confirm owner, budget, legal entity, jurisdiction, data location, and
  operational/on-call coverage;
- compare VPS quotes for 2 vCPU / 4 GiB, system SSD, 20–50 GiB persistent
  local SSD capacity, transfer, IPv4/IPv6, backups, restore, support, tax,
  and cancellation/export terms;
- verify Linux image support, Docker/Compose, snapshot/volume behavior,
  security-update controls, host MFA and access logs, and a restore path;
- price separate encrypted backup storage and retrieval; verify retention,
  deletion protection, encryption/key custody, and account separation;
- select DNS/edge and TLS issuance/renewal products, confirm both domains
  can be managed, origin bypass protection and access controls are tested;
- quote the MFA access provider against user count, required factors, audit
  retention, emergency access, and SSO requirements;
- name the credential, certificate, backup-key, deployment, monitoring, and
  incident-response custodians; document renewal/expiry alerts.

USD planning envelope from DPE-01 (not vendor quotes; verify regional rates
and included disk at purchase):

| Item | Initial/recurring planning range | Status |
|---|---:|---|
| New infrastructure spend in this preparation | **$0** | No purchase, subscription, or billable resource was created. |
| VPS compute, 2 vCPU / 4 GiB class | $25–50/month; $300–600/year | Essential; a separate persistent volume may add cost if not included in the local disk allocation. |
| Encrypted off-host backups | $2–15/month; $24–180/year | Essential; driven by actual database size, retained generations, requests, and restore operations. |
| MFA identity/perimeter | $0–50+/month; $0–600+/year | Essential capability; existing org licensing/free tiers may reduce cash cost but not administration/retention responsibilities. |
| DNS/TLS | $0–14/month combined planning allowance; $0–168/year | Essential functions; basic DNS and automated certificates may be included/free; paid edge/features are optional. Reprice against selected provider. |
| Monitoring/alerting | $0–20/month; $0–240/year | Essential outcome; provider/basic checks may be included. Paid retention/SLA optional. |
| Domain registrations | **US$14.81 reported already paid** for the first year, both domains | Sunk owner-reported cost, not independently verified; renewal rate is unknown and excluded from recurring estimate until quoted. No extra domain purchase. |

Current planning total is approximately **$27–150/month**
(**$324–1,800/year**) before taxes, labor, unknown domain renewals, and any
separately billed persistent disk or premium support. Actual first invoice
after future approval depends on billing cycle, deposit/prepayment terms, and
selected services; do not treat the envelope as a quote or commitment.
One-time engineering, incident response, and on-call labor are not priced.
Potential free tiers are optional cost reductions, not assumptions for
security controls or availability.

Pricing references and assumptions are dynamic. Recheck the DPE-01 listed
[DigitalOcean Droplet](https://www.digitalocean.com/pricing/droplets),
[DigitalOcean Volume](https://docs.digitalocean.com/products/volumes/details/pricing/),
[Render](https://render.com/pricing), [Fly.io](https://fly.io/docs/about/pricing/),
and [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) schedules
and compare them with the selected provider's current region-specific quote.
The existing one-year domain amount is the owner's reported price, not a
renewal quote. Nothing has been ordered.

## 10. Acceptance gates and remaining decisions

Do not proceed to external infrastructure or DNS until each applicable gate
has an owner, evidence, and separate authorization:

1. **Provider and custody:** approved host, region, support/on-call owner,
   account recovery, budget, and data jurisdiction.
2. **Private staging:** new isolated host/environment with only synthetic
   content and independently generated staging credentials; no public route,
   no production secrets/database, no publisher role.
3. **Storage:** persistent local SSD mounted at the approved data path,
   correct UID/GID 1001 permissions, tested restart persistence, capacity
   alerts, and no network/shared SQLite volume.
4. **Identity and firewall:** MFA-backed private access, deny-by-default
   firewall, private app listener, restricted operator/SSH path, and
   verified separation of API traffic from browser access.
5. **Artifact and authority:** scanned/pinned image digest, documented
   approval/deployer, build pipeline without production credentials or
   publication authority, and explicit proof that deployment cannot release.
6. **Data protection:** client-side encryption, separate off-host account,
   checksum/age alerts, approved retention/key custodians, and successful
   isolated restore with manifest/audit/lockdown verification.
7. **DNS/TLS/HSTS:** owner-authorized DNS runbook for both domains, origin
   bypass tests, valid TLS and redirect verification, renewal monitoring,
   explicit HSTS includeSubDomains decision, and canonical sitemap/metadata
   check. These are not part of this preparation.
8. **Operations/privacy:** restricted content-free monitoring and logs,
   retention/privacy decision, 70%/85% disk alerts, incident procedure,
   named recovery staff, and approved RPO/RTO.
9. **Owner acceptance:** resolve legal/privacy/security and cost decisions;
   accept the DPE-02A limitations and evidence; record a written go/no-go
   for the next phase. Public launch and editorial release require separate
   authorization even after staging acceptance.

Still open: provider/region and local-disk billing; access gateway and
eligible MFA users; DNS/edge/TLS provider and DNSSEC; HSTS subdomain
readiness or revised policy; backup provider, retention, encryption key and
recovery custodians; approved RPO/RTO and on-call roster; log retention and
privacy notice; exact integration route policy; and domain renewal
verification.

**Stop point:** DPE-02B1 produced this proposal and updated the DPE-01
establishment record only. No host, directory, service, DNS, certificate,
identity provider, backup account, public route, or deployment was
provisioned. No production secret or genuine research material was
transferred. No commit or push was made.
