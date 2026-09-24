# Dispatch Publication Gateway

## Routes

| Route | Purpose |
| --- | --- |
| `POST /api/publications` | Create a draft, replay an idempotent operation, or submit an explicit origin revision |
| `GET /api/publications` | List internal publications |
| `GET /api/publications/[id]` | Retrieve a linked publication and current version |
| `PATCH /api/publications/[id]` | Edit a draft/review with `expectedVersion` |
| `POST /api/publications/[id]/evidence` | Associate a registered evidence UUID |
| `POST /api/publications/[id]/transition` | Request a version-checked lifecycle transition |
| `GET /api/public/publications/[slug]` | Read the safe public projection |

All private mutations accept `x-request-id` and `x-correlation-id`; Dispatch
generates missing values. The correlation ID is returned in successful internal
responses and stable errors. `Idempotency-Key` is supported for create/origin
synchronization operations.

## Concurrency and origin behavior

`PATCH`, evidence association, and lifecycle requests require a positive
`expectedVersion`. A stale request returns HTTP 409 with `STALE_VERSION`.

The tuple `originatingApplication + originatingProject + stableObjectId` is
unique. A create request that finds the tuple is not silently treated as a
retry:

- the same `Idempotency-Key` and same payload returns the stored result;
- the same key with a different payload returns `IDEMPOTENCY_CONFLICT`;
- no key and no `expectedVersion` returns `ORIGIN_CONFLICT`;
- the current `expectedVersion` creates a legitimate new origin revision.

## Evidence association

```json
{
  "evidenceId": "22222222-2222-4222-8222-222222222222",
  "expectedVersion": 4,
  "revisionSummary": "Attach registered methodology."
}
```

The ID must resolve through `EvidenceRegistry`. Unknown/rejected evidence
returns `EVIDENCE_NOT_REGISTERED`. Extra raw metadata, upload bytes, filesystem
paths, and upload-shaped fields fail validation or policy.

## Authentication versus authorization

`actorFromRequest` first verifies a configured machine credential. A bearer
token is hashed and compared to a configured hash, or an HMAC signature over
the method, path, timestamp, and body hash is verified. The resulting actor's
identity and roles come entirely from `MAYDAY_APPLICATION_CREDENTIALS`.
`x-mayday-role(s)` is only a development/test adapter enabled with
`MAYDAY_TRUST_DEV_HEADERS=true`; production-shaped clients do not use it.
Role and resource authorization remains centralized in
`PublicationAuthorizationPolicy` and must not move into route handlers.

External applications can synchronize their own origin only while it remains
in `draft`. Any sync/update attempted after review begins returns HTTP 409
`EDITORIAL_LOCK`, with `publicationId`, `currentVersion`, and
`currentLifecycleState`.

## Internal response metadata

Internal single-publication responses include `originLink` with publication ID,
current version, editorial URL, optional public URL, origin identity, and last
synchronized timestamp. They also include `correlationId`. This metadata is
intended for application linking and is excluded from public responses.
