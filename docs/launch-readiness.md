# Phase Twelve launch readiness

**Status: not authorized for public launch.** This phase does not deploy a
public site, publish production content, buy infrastructure, or enable
autonomous publishing.

The infrastructure assessment and proposed DPE-02 acceptance gates are in
[production-establishment.md](./production-establishment.md). That plan is
not evidence that a provider, domain, identity perimeter, backups, monitoring,
or public deployment has been configured.
The Golden Horn reports ownership of `thegoldenhorn.news` and
`thegoldenhorn.org`; live DNS, hosting, TLS, identity, and public service
configuration remain outstanding.

## Acceptance evidence and remaining decisions

| Area | Phase Twelve evidence | Status before launch |
| --- | --- | --- |
| Release authority | Ready remains private; publisher session, expected version, readiness, public visibility, lockdown, audit, and immutable snapshot are checked on release. The DPE-02A synthetic HTTP rehearsal confirmed integration release denial, explicit publisher release, unchanged public snapshots until explicit correction release, and lockdown denial/persistence. | Historical-image rollback and remaining DPE-02A owner review before staging sign-off. |
| Public integrity | Public queries verify the persisted snapshot digest and corresponding release audit. A local synthetic backup/restore retained manifests, digests, revisions, audit records, and lockdown state with SQLite integrity and schema-8 compatibility checks passing. | Off-host recovery design, retention and objectives; local restore is not production backup evidence. |
| Legacy records | Missing-manifest published rows fail closed; they require publisher re-review and explicit release. | Inventory actual records; no automatic backfill. |
| Security | Structured audit and adversarial schema/session/body tests; dependency audit evidence is in `security-review.md`. | External MFA, rate limits, perimeter restrictions, and TLS still require configuration. |
| Operations | DPE-02A verified the committed baseline application image against a separate schema-8 restore with release manifests and public snapshot retrieval intact. An isolated SQLite write-lock test returned health 503 and rejected a mutation, then recovered writes without changing the released snapshot, manifests, or lockdown. The local report is ready for owner acceptance; it does not mean production operations exist. See [dpe-02a-staging-rehearsal.md](./dpe-02a-staging-rehearsal.md). | Select production host, off-host backup target and retention, monitoring/alerting, recovery objectives, and on-call rotation. |
| Legal and privacy | Public privacy/methodology pages describe known application behavior and unresolved details without fabricated contact or entity information. | Jurisdiction-specific legal review and owner approval required. |
| Editorial content | No real launch candidates were supplied for review in this phase. Development samples remain development-only. | Prepare and approve real candidates; do not release automatically. |
| Accessibility and performance | Structured-content checks and local browser review are recorded with the final validation results. | Repeat against the selected production perimeter and representative content. |

## Launch-content preparation checklist

Use one row per real candidate. An empty inventory is preferable to invented
content.

| Candidate title/ID | Category | Editorial owner | Evidence/source readiness | Rights/attribution review | Public visibility assessment | Lifecycle | Outstanding review |
| --- | --- | --- | --- | --- | --- | --- | --- |
| No launch candidates supplied | — | — | — | — | — | — | Prepare from actual, reviewed material only. |

For each candidate, record claim-to-source checks, corroboration and
contradictions, method, uncertainty, source sensitivity, privacy/safety
concerns, rights, accessibility, public metadata, correction/update plan, and
the person authorized to approve release. A candidate does not advance
automatically from preparation, analysis, or `ready`.

## Pre-launch external controls

Before any public exposure, the service owner must configure and verify:

- an identity perimeter with MFA for editorial and operational users;
- rate limits and abuse monitoring for sign-in and all exposed APIs;
- HTTPS termination, host allow-listing, request-size limits, and network/VPN
  access restrictions at the reverse proxy or edge;
- a documented, minimal reverse-proxy trust contract that preserves the
  external origin without trusting arbitrary forwarded-host values;
- privacy-reviewed access logging, log retention, alerting, off-host backup,
  backup retention, and restore/recovery objectives;
- legal review of privacy, rights, service, and any applicable terms before
  client inquiries or engagements are accepted.

These are not provided by this repository merely because they are listed
here. The application implements its own publisher/session checks, exact
Origin checks, body-size limit, public projections, CSP, and durable release
audit; they do not replace the perimeter.

## Go/no-go

Do not launch until the actual deployment image and staging environment have
passed the rehearsals in `production-runbook.md`, owners have signed off on
security/legal/editorial decisions, the legacy content inventory is resolved,
real content is reviewed, and all remaining findings have a named owner and
accepted disposition. No live DNS or production identity provider,
publication candidate, legal entity, contact address, contact email, or
retention period is assumed here.
