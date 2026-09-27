# Publication release and recovery

## States and authorization

The existing publication lifecycle remains the editorial workflow:

`draft → review → ready → published`

`published → updated` represents a substantive update. `archived` removes a
publication from public queries; draft, review, ready, and archived records
are not public. In particular, `ready` is private and is not an alias for
publication. There is no scheduler or background release worker.

The production route requires a configured publisher or administrator
authenticated with an editorial session. Application bearer credentials,
signed upstream requests, development headers, Research Studio, Overwatch,
Mayday3, and operator-only accounts cannot authorize a release. The operation
checks the expected version, public classification, persisted lockdown state,
and publication-readiness findings immediately before saving.

## Atomic manifest

The release transaction stores the lifecycle revision, successful audit event,
and immutable manifest together. The manifest binds:

- publication ID and exact post-transition version;
- release timestamp and publisher subject;
- digest of the public-safe snapshot;
- evidence validation outcome;
- release operation ID and audit correlation;
- resulting `published` or `updated` status.

It contains a public-safe snapshot, not restricted provenance or source
material. Public API, article, search, homepage, category pages, and sitemap
queries read the latest verified manifest and verify that its snapshot digest
and audit binding match. They do not reconstruct public content from the
mutable editorial row.

## Corrections and updates

Edit a released article as a correction or substantive update, include the
required public note, save against the visible expected version, and review the
resulting staged revision. The old public snapshot remains served until a
publisher explicitly releases the new version. Unreleased content, visibility
changes, and readiness do not amend that snapshot. Use the archive transition
for withdrawal; do not try to withdraw an article by changing its staged
visibility.

Lockdown blocks new releases regardless of the route used. It does not hide
prior snapshots or prevent an authorized archive/takedown. Activation and
deactivation are separately audited operator actions and survive restart.

## Legacy Phase Eleven content

Migration 008 intentionally does not infer or manufacture authorization for
existing `published` or `updated` rows. Rows without a Phase Twelve manifest
are excluded from public queries, even if their old lifecycle field says
published. The editorial workspace identifies this condition.

For each legacy candidate, verify its source, current content, public
classification, privacy/rights review, readiness, and prior release record.
An authorized publisher must then explicitly release the reviewed current
version to create a Phase Twelve manifest. Do not bulk-backfill, auto-release,
or use a database import to bypass this decision. Keep a pre-migration backup;
restore it only to a separate path if legacy public visibility must be
recovered before re-review.

## Database recovery and rollback

Migration 008 is additive: it adds a release-manifest table and indexes and
does not rewrite publication rows. An older Phase Eleven binary can open the
expanded schema, but it does not understand manifests and serves current
publication rows directly.

An application-only rollback is safe only before Phase Twelve editorial
changes, releases, or archives have been written. After any such action, an
older binary could reveal a staged revision or ignore a withdrawal. Stop the
candidate, restore the verified pre-upgrade database to a **new** path, and
perform a deliberate configuration cutover to that database and the previous
image. This discards writes after that backup; preserve the newer database for
investigation and do not overwrite it. Checking out an older commit is not a
database rollback.

Verify migration status, `PRAGMA integrity_check`, publications, revisions,
audit rows, evidence relationships, release manifests, and lockdown state
after any restore. Never restore over an active database.
