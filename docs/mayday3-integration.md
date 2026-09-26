# Mayday3 integration

Mayday3 is a controlled evidence provider, not a publishing client. Its
`Mayday3EvidenceClient` uses the shared Dispatch machine transport only for
`POST /api/evidence`, `GET /api/evidence/:id`, and version-checked
`PATCH /api/evidence/:id`.

Configure Mayday3 with its own `MAYDAY_APPLICATION_CREDENTIALS` record using
`applicationName: "mayday3"`. A credential establishes that application
identity; a request header cannot claim it. Mayday3 has no publication,
lifecycle, editorial-content, or public-rendering operation.

Register evidence before an upstream application or editor associates its
stable UUID with a publication. Registration is metadata-only: it does not
upload a binary, create an association, or make anything public. Evidence must
be `ready` before it may be associated.

Workers retry a registration with the same `Idempotency-Key`. Evidence identity
is distinct from idempotency: the UUID remains stable while a current
`expectedVersion` creates a new metadata/processing revision.
