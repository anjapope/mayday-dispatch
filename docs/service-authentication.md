# Service authentication

Dispatch machine-to-machine authentication is configured with
`MAYDAY_APPLICATION_CREDENTIALS`, a JSON array of credential records. Each
record has an `applicationName`, `subjectId`, allowed gateway `roles`, and one
or both of the following credentials:

- `tokenHash`: SHA-256 hex digest of a bearer token. Clients send
  `Authorization: Bearer <token>`; Dispatch hashes the supplied token and
  compares hashes in constant time.
- `hmacSecret`: shared secret for signed requests. Clients send
  `x-mayday-app`, `x-mayday-timestamp`, and `x-mayday-signature`. The
  signature is HMAC-SHA256 over `METHOD`, request path, timestamp, and the
  SHA-256 body hash, separated by newlines. Timestamps outside five minutes
  are rejected.

Secrets are supplied through deployment configuration and are never logged,
stored in source, returned by an API, or copied to audit events. Configure
roles with the credential record; request headers cannot grant roles.

Authentication proves the calling application and creates `GatewayActor`.
Authorization remains a separate `PublicationAuthorizationPolicy` or
`EvidenceAuthorizationPolicy` decision. Development identity headers are
available only when `MAYDAY_TRUST_DEV_HEADERS=true` (and automatically during
tests); they are not a production client contract.
