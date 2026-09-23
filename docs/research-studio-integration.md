# Research Studio integration

`ResearchStudioDispatchClient` under `src/integrations/research-studio` is the
Dispatch-owned contract adapter. It supports:

- create/synchronize draft with optional `Idempotency-Key`;
- retrieve the linked publication and current version;
- update a draft with `expectedVersion`;
- attach a registered evidence ID;
- request a lifecycle transition.

The adapter sends the development external-application identity headers and
parses all responses through Dispatch DTO schemas. `STALE_VERSION` becomes
`ResearchStudioVersionConflictError`; callers should retrieve the current
publication, reconcile editorial changes, and retry with the new version.
Other stable errors become `ResearchStudioDispatchError` with code, status, and
correlation ID.

Origin identity is a durable business link, not an operation retry key.
Research Studio should keep the returned publication ID/version and use a fresh
idempotency key for each new create/synchronize operation. Reusing the same key
is only for retrying the exact same request.

The adapter is contract-tested inside Dispatch with an injected `fetch`.
No Research Studio worker, deployment, background synchronization, or remote
repository change is implemented here.
