# TGH-INT-002 news observation contract

## Purpose and architectural position

`mayday.news-observation/1` is an in-process, typed contract for future
Intelligence-to-Golden-Horn news synchronization. It models sourced news
observations, not analytical publications and not evidence registration. It
adds no route, listener, scheduler, persistence, credential, live transport,
or public UI.

The contract is implemented in
[`src/news-observations/contract.ts`](../src/news-observations/contract.ts).
It is intentionally presentation-neutral: a future Golden Horn consumer owns
markers, clustering, animation, hover interactions, feeds, and trends.

## Identity and deduplication

Each record carries:

- `protocol`: fixed to `mayday.news-observation/1`;
- `observationId`: Golden Horn's stable observation identity;
- `intelligenceDocumentId`: the upstream Intelligence document identity;
- optional `sourceRecordId` and `acquisitionId`;
- `revisionId`: the upstream record/update identity.

`observationId` and `intelligenceDocumentId` are deliberately distinct.
Synchronization batches reject duplicate observation IDs. The contract does
not infer that different document revisions are different observations.

## Fields, provenance, and time

Required source fields are headline, publisher, canonical public HTTP(S) URL,
and source type. Source summary and source publication time are optional;
missing publication time remains missing. The required temporal fields are
Intelligence acquisition time, Golden Horn observation creation time, update
time, and explicit freshness (`current`, `stale`, or `unknown`).

The contract rejects temporal contradictions: source publication cannot follow
acquisition; acquisition cannot follow observation creation; observation
creation cannot follow update. It never fills missing source times with the
current time.

Provenance retains originating system, source/acquisition references, evidence
identifiers, verification state, and transformation lineage. Verification is
one of `unverified`, `corroborated`, `verified`, `disputed`, or `unknown`.
Normalization only orders equivalent collections; it cannot elevate
verification, source trust, geographic confidence, or public eligibility.

## Topics, geography, and relationships

Topic IDs are lowercase, hyphenated identifiers independent of frontend
labels. Source tags are optional source-supplied labels. Related observation
IDs are bounded and unique.

An observation may have zero to 25 geographic references. Each reference has
a stable ID, place name, optional coordinates, relationship, confidence,
optional evidence IDs, provenance, and optional resolution method. Supported
relationships are `EVENT_LOCATION`, `MENTIONED_LOCATION`, `SOURCE_LOCATION`,
`INFERRED_RELEVANCE`, `UNKNOWN`, and `UNRESOLVED`. Unknown/unresolved
references cannot carry coordinates, and inferred relevance cannot claim high
confidence. A source location is never normalized into an event location.

## Public eligibility and safe projection

`publicFeed.eligibility` is `eligible`, `pending`, or `ineligible`. Pending
and ineligible records require one or more bounded machine-readable reasons;
eligible records cannot carry blocking reasons. Eligibility authorizes neither
an analytical publication transition nor a gateway operation.

`toPublicNewsObservation` is an explicit allowlist for a future public
headline/map consumer. It requires an eligible observation and includes public
headline/source/time/topic/geography fields only. It excludes Intelligence
document IDs, source/acquisition references, evidence IDs, transformation
lineage, internal notes, and geographic evidence/provenance.

## Validation limits

The contract rejects rather than truncates invalid data: headline 500
characters; summaries 5,000; identifiers 200; 20 topic IDs; 30 source tags;
50 related IDs/evidence IDs; 25 geographic references; 20 lineage entries;
and 10 eligibility reasons. It also rejects unsupported protocols, malformed
URLs/timestamps, invalid coordinate ranges, duplicate collection entries,
unknown enum values, markup, and internal filesystem paths.

## Relationship to existing systems

The existing Evidence Registry remains the controlled metadata registry.
Observation `evidenceIds` are opaque references only; this phase does not
look them up or alter evidence records. The existing publication gateway
remains the only analytical-publication workflow. Overwatch and Research
Studio retain draft-only submission authority.

| Intelligence acquisition concept | Observation field | Status |
| --- | --- | --- |
| Upstream document record | `identity.intelligenceDocumentId` | PROVISIONAL |
| Source/feed item identity | `identity.sourceRecordId` | PROVISIONAL |
| Acquisition run or record | `identity.acquisitionId`, `provenance.acquisitionReference` | PROVISIONAL |
| Source headline/summary/publisher/URL | `source` | PROVISIONAL |
| Acquisition time | `temporal.acquiredAt` | PROVISIONAL |
| Upstream revision | `identity.revisionId` | PROVISIONAL |
| Provenance/evidence | `provenance` | PROVISIONAL |

The exact Intelligence schema has not been verified. This mapping is a local
contract proposal, not a claim about source-side guarantees.

## Deferred capabilities

Live INT–TGH transport, credentials, scheduling, persistence migrations,
public routes, feed and map rendering, geographic enrichment, AI summaries,
and production activation are explicitly deferred. A future synchronization
adapter must authenticate independently, use stable identity/revision
semantics, preserve source/acquisition timestamps, handle idempotency and
staleness, and never grant analytical publication authority.
