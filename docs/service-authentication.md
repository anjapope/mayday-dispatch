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

Configure Overwatch as its own credential record with `applicationName` set to
`overwatch`. Do not reuse Research Studio credentials: the resolved
application identity is also used to enforce origin ownership.

Configure Mayday3 separately with `applicationName` set to `mayday3`. Mayday3
credentials authorize controlled evidence registration/update only; they do
not confer publication, editorial, or lifecycle authority.

Authentication proves the calling application and creates `GatewayActor`.
Authorization remains a separate `PublicationAuthorizationPolicy` or
`EvidenceAuthorizationPolicy` decision. Development identity headers are
available only when `MAYDAY_TRUST_DEV_HEADERS=true` (and automatically during
tests); they are not a production client contract.

The credential configuration can be supplied as `MAYDAY_APPLICATION_CREDENTIALS`
or, preferably for production, through `MAYDAY_APPLICATION_CREDENTIALS_FILE`.
Production startup requires separate credentials for Research Studio,
Overwatch, and Mayday3, plus distinct configured editorial publisher and
operator identities. Upstream roles cannot include editorial or publisher
authority, and the operator role cannot include publisher/admin authority.

Editorial browser sign-in exchanges an application-configured Dispatch account
credential for a signed, eight-hour, `HttpOnly`, `SameSite=Strict` cookie. The
signing key is supplied through `MAYDAY_SESSION_SECRET_FILE` or the
`MAYDAY_SESSION_SECRET` runtime setting and is never exposed to browser code.
Sessions resolve current roles from the server configuration and reject
cross-origin state-changing requests. This is not an OIDC/MFA provider; protect
editorial routes with the organization's identity perimeter and rate limits.
See the [production runbook](./production-runbook.md) for provisioning,
rotation, and deployment requirements.
