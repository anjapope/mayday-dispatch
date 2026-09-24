# Research Studio integration

`ResearchStudioDispatchClient` under `src/integrations/research-studio` is the
Dispatch-owned contract adapter. It supports:

- authenticated create/synchronize draft with optional `Idempotency-Key`;
- retrieve the linked publication or its current version;
- update a draft with `expectedVersion`;
- attach a registered evidence ID;
- request a lifecycle transition.

The adapter requires a bearer token or HMAC secret supplied by the deploying
application's configuration. It never sends role, subject, or application
identity headers that could establish authority. It forwards optional request
and correlation IDs and parses all responses through Dispatch DTO schemas.
`STALE_VERSION`, `ORIGIN_CONFLICT`, `UNAUTHORIZED`/`FORBIDDEN`, and
`EDITORIAL_LOCK` become typed errors. Callers recover from a stale version by
retrieving the current publication, reconciling changes, and retrying with its
current version.

Persist the `ResearchStudioIntegrationLink` fields exactly as returned:
`dispatchPublicationId`, `dispatchVersion`, `dispatchState`,
`dispatchEditorialUrl`, optional `dispatchPublicUrl`,
`dispatchLastSyncedAt`, and `dispatchOriginIdentity`. The origin identity is a
configured stable business identity; it is never derived from a title or slug.

Origin identity is a durable business link, not an operation retry key.
Research Studio should keep the returned publication ID/version and use a fresh
idempotency key for each new create/synchronize operation. Reusing the same key
is only for retrying the exact same request.

The adapter is contract-tested inside Dispatch with an injected `fetch`.
No Research Studio worker, deployment, background synchronization, or remote
repository change is implemented here.
