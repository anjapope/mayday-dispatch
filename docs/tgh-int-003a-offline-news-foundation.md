# TGH-INT-003A offline automated news foundation

## Boundary

This phase implements a local, fixture-backed automated news channel in
Dispatch. It establishes no live Mayday Intelligence connection, credentials,
network listener, scheduler, database migration, or public deployment. The
analytical publication gateway remains a separate channel with its existing
editorial release controls.

## Components

- `src/news-observations/contract.ts` defines the versioned observation
  contract and public allowlist.
- `src/news-observations/provider.ts` defines the replaceable provider and
  bounded cursor query contract.
- `src/news-observations/fixture-provider.ts` supplies deterministic synthetic
  observations and is the only active provider.
- `src/news-observations/query.ts` aggregates supported event locations for
  map presentation.
- `app/news-feed.tsx` presents eligible fixture headlines without accessing a
  live service.

The provider declares `liveIntelligence: false`; no hidden network fallback
exists. A future authenticated provider can implement the same list/get
interface without changing the feed or map components.

## Observation, eligibility, and safety

The established `mayday.news-observation/1` contract retains distinct
observation/document/revision identities, source attribution, canonical URL,
optional publication time, acquisition/update times, provenance, topics,
related observations, and zero or more geographic references.

Eligibility is explicit: `eligible`, `ineligible`, `requires_review`, or
`unknown`. Only eligible records reach the public projection. Other states
require machine-readable reasons and cannot become eligible by normalization.
The public projection excludes upstream document IDs, evidence IDs,
acquisition/source references, internal notes, lineage, and geographic
provenance.

## Headline feed and refresh behavior

The homepage retains its existing cartographic and analytical-publication
lanes, with a distinct **Synthetic observation feed**. It renders eligible
headlines, source attribution, topic IDs, source/observation time, safe
canonical links, stale status, an accessible fixture-data notice, and a
bounded local topic filter.

The client updates its local refresh indicator every minute without a page
reload. This is a presentation contract only; it does not poll Mayday
Intelligence or simulate live acquisition. A future authenticated provider
will supply bounded incremental pages to this same query boundary.

## Geographic and trend behavior

Only eligible `EVENT_LOCATION` references with coordinates and at least
medium confidence create observation-backed points. Mentioned locations,
publisher/source locations, inferred relevance, unresolved locations, and
low/unknown-confidence claims cannot create event markers.

Points group observations by label and exact supported coordinates. The
context panel reports only descriptive fixture trends: headline count, distinct
publisher count, and topic distribution. It draws no analytical conclusion.
Non-geographic observations remain in the ordinary feed. Static historical
hotspots remain present and visually distinct.

## Validation and limits

The contract rejects unsafe markup, internal filesystem paths, malformed URLs
and timestamps, invalid coordinates, duplicate identities, duplicate
relationships, temporal contradictions, unsupported geographic semantics, and
oversized fields or arrays. The fixture provider additionally enforces stable
newest-first ordering, cursor pagination, topic/temporal filters, and a
maximum page size of 20.

## Future live dependency

Live integration remains blocked on a Mayday Intelligence authenticated,
read-only consumer interface with versioned schema/capability reporting,
stable document/revision identities, bounded cursor pagination, source and
provenance access, incremental filtering, response-size limits, independent
consumer authorization, rotation/revocation, audit logs, and rate limiting.
That future provider must preserve the contract boundaries and cannot receive
publication-gateway authority.
