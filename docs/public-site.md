# Public site

Mayday Dispatch's public site is a server-rendered projection of governed
publications. Public routes use the `PublicPublication` projection and the
`public-query` service; they do not read internal evidence, provenance,
assessment, editorial, or audit data.

The homepage, `/publications`, topic pages, series pages, and article routes
include only public publications in `published` or `updated` lifecycle states.
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
