# Corrections and updates

Corrections fix an error in already published material. Send an editorial update with
`revisionType: "correction"` and a `correctionNote`; an optional explanation can be supplied.
The publication keeps its stable ID and origin identity, increments its version, retains the
previous snapshot, and publishes a correction notice when `correctionPublic` is not false.

Substantive updates represent new information or analysis. Send `revisionType:
"substantive-update"` with an `updateNote`. For a published item this produces the `updated`
lifecycle state and may expose an update notice. It is not a new publication unless the upstream
object or reporting period is genuinely a new product.

Withdrawal is not implemented in Phase Six. Archival is the supported non-destructive withdrawal
boundary; archived publications are retained for history and are unavailable through the public
publication route.
