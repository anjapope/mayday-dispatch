# Public site

Mayday Dispatch's public site is a server-rendered projection of governed
publications. Public routes use the `PublicPublication` projection and the
`public-query` service; they do not read internal evidence, provenance,
assessment, editorial, or audit data.

The homepage, `/publications`, topic pages, series pages, and article routes
include only exact, digest-verified release snapshots. A mutable editorial
row is never used to rebuild an existing public page.
Browse supports textual title/summary/body/tag search plus type, topic, and
series filters. Series and related-publication navigation are deterministic,
using public series IDs and shared public tags.

Public evidence lists distinguish public URLs from citation-only references.
Corrections, substantive updates, and revision history use only projected,
public-safe notice and revision metadata.

The Phase 9.5 navigation model places Global Monitor, Analysis, Forecast,
Services, and Contact in the primary navigation. These destinations classify
already-public publications without duplicating records or changing the
underlying publication authority model. The public visual system is documented
in [public-visual-system.md](./public-visual-system.md).

Production indexing is generated from the same verified-release query
boundary. The robots file disallows the editorial subroutes and API paths
(authorization remains the privacy boundary), and the sitemap includes only
current public release snapshots. A Phase Eleven published row has no Phase
Twelve release manifest and is deliberately excluded until a publisher
re-releases the reviewed record. There is no RSS feed. An empty production
database displays a truthful homepage and category empty state; development
fixtures do not fill those sections in production.

Set `MAYDAY_PUBLIC_INDEXING_DISABLED=true` in a non-public staging environment
to return a sitewide `X-Robots-Tag: noindex, nofollow, noarchive` and a
sitewide robots disallow. This is an indexing signal, not access control. Set
`MAYDAY_PUBLIC_BASE_URL` to the selected HTTPS origin before
enabling indexing; without it no canonical origin is guessed and the sitemap
is empty. Editorial routes are marked `noindex`. Production asset and HTTPS
rules are documented in [production-runbook.md](./production-runbook.md).

Public classification pages distinguish Global Monitor (situation-oriented
reporting), Analysis (longer interpretive work), and Forecast (conditional
scenarios and indicators). The labels do not grant release permission. Public
external images are editor-reviewed HTTPS resources, and the browser sends no
referrer when loading them; their hosts can still observe the request.
