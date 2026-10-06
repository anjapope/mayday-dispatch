# TGH-INT-003D controlled real-provider rehearsal

## Controlled architecture and secrets

Dispatch reaches the private Mayday Intelligence provider through an existing
Mayday1 loopback SSH tunnel. The Dispatch endpoint is configured only in the
rehearsal process as `http://127.0.0.1:8765`; it is not committed or exposed to
the browser. The dedicated `dispatch-tgh-consumer` credential is read from the
protected local token file configured through
`MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE`. Its sole provider capability is
`intelligence:documents:read`. The token is absent from Git, code,
documentation, the Dispatch database, browser props, and operational output.

The provider remained private behind the Mayday1 loopback tunnel. No public
ingress, DNS, TLS, SSH setup, Mayday3 service, acquisition configuration, or
provider implementation was changed by this rehearsal.

## Provider and authentication results

The live provider returned the frozen `mayday.intelligence.document/1` DTO.
Health requests were rejected with HTTP 401 when unauthenticated or supplied
an invalid credential; the protected Dispatch token file produced HTTP 200.
A bounded collection request returned HTTP 200, one item, and the expected
protocol. The Dispatch transport continues to expose only the contract's
document health, collection, and detail GET operations.

## Bounded synchronization results

The manually gated rehearsal used a page size of 2, a maximum of one page, and
a maximum of two accepted observations, with no timestamp window. The initial
backfill persisted two records. Both entered as `requires_review`, with zero
rejections. The same bounded replay created no additional rows and recorded
two duplicates. The bounded incremental run used its own durable continuation,
persisted before checkpoint advancement, and likewise recorded two duplicates.

The resulting cache has two rows. The backfill and incremental checkpoints both
point to the final bounded page cursor, retain their last-success timestamps,
and report `current`. No raw document bodies were recorded here.

## Operator review and public projection

Migration 010 adds a review-only audit table. The new operator-only endpoint
is limited to an authenticated Dispatch `operator` role and permits only
`requires_review -> eligible` or `requires_review -> ineligible`. It stores
the document identity, prior/new eligibility, operator subject/application,
decision time, and an optional bounded note. It imports no publication,
publisher, release, or editorial lifecycle authority.

The rehearsal explicitly assigned one real cached record `eligible` and the
other `ineligible` under the `dispatch-rehearsal-operator` identity, then
replayed the same upstream page. The replay retained both local decisions:
one record appears through the synchronized public-safe feed and the
ineligible record remains internal. No analytical publication, release
manifest, lifecycle transition, or immutable snapshot was created.

The v1 provider documents used in this rehearsal did not yield a safe
`EVENT_LOCATION` with coordinates and medium/high confidence after canonical
normalization. No map marker was created and no geography was inferred from a
publisher, source, or mention.

## Recovery and remaining prerequisites

Automated coverage verifies provider-unavailable, authentication-failure,
staleness, validation, review-transition rejection, audit attribution,
replay-preserved eligibility, cache recovery, and publication isolation. The
real provider was not interrupted; a provider-unavailable rehearsal remains
covered by deterministic transport failure tests to avoid disturbing Mayday3.

Before unattended synchronization, establish operator runbooks and monitoring,
an approved retry/backoff policy, an explicit real-process restart rehearsal,
and a reviewed credential/tunnel lifecycle. Before any controlled public
activation, authorize public presentation separately, establish geography
review criteria, and complete a public-facing security review. No scheduler,
background poller, startup auto-sync, or public deployment is enabled.
