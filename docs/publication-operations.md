# Publication operations

Publication mutations remain inside `PublicationGatewayService`. Editorial edits require an
`expectedVersion`; successful mutations create a new revision and audit event. Origin identity and
provenance are retained and cannot be replaced by routine editorial edits.

The lifecycle graph is authoritative:

`draft -> review -> ready -> published -> updated`

Review, ready, and published states can also be archived where permitted by the domain graph.
Only publisher and admin actors can publish. External applications can synchronize their own
drafts, but synchronization is locked after editorial workflow begins.

Corrections and substantive updates use distinct revision types. Corrections record a public
correction notice; substantive updates may record a public update notice and move a published
publication to `updated`. Archive records a reason, an `archive` revision type, and an audit
event, then retains the publication outside public routing. It never deletes the publication.

The editorial preview calls the same `toPublicPublication` projection used by the public route.
It never exposes origin IDs, internal provenance, private evidence, request metadata, or internal
assessment fields.
# Public rendering

Only public publications in `published` or `updated` lifecycle states are
eligible for homepage, browse, search, series, topic, and feed-style public
surfaces. Corrections and updates render from the public notice projection.
