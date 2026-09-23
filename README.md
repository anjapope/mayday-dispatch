# Mayday Dispatch

Mayday Dispatch is a domain-first publishing service for evidence-led research,
OSINT reports, and operational dispatches. Phase Three adds durable SQLite
persistence, optimistic concurrency, registered evidence, atomic audit records,
operation idempotency, and a tested Research Studio client contract while
retaining the Phase One domain and Phase Two gateway boundaries.

## Stack

- Next.js App Router, React, strict TypeScript, and Zod
- Node's SQLite driver with ordered SQL migrations
- Vitest and ESLint

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

`MAYDAY_DATABASE_PATH` selects the database file and defaults to
`data/mayday-dispatch.sqlite`. Database files, WAL files, and the `data/`
directory are ignored by Git.

| Command | Purpose |
| --- | --- |
| `npm run db:migrate` | Apply ordered, transactional SQL migrations |
| `npm run test:migrations` | Verify setup, restart, schema, and transaction behavior |
| `npm test` | Run all tests |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the production application |

## Phase Three guarantees

- Every mutation supplies `expectedVersion`; stale writes return
  `STALE_VERSION` without changing durable state.
- The origin tuple remains unique. Reusing it without `expectedVersion` is a
  conflict; supplying the current version is an intentional origin revision.
- `Idempotency-Key` is optional and scoped to the authenticated actor. An exact
  replay returns the original result; reusing the key for a different payload
  returns `IDEMPOTENCY_CONFLICT`.
- Evidence must already exist in an `EvidenceRegistry` and is associated by its
  stable UUID. Dispatch accepts no binary or raw upload payload.
- Publication state, revision snapshot, relationships, lifecycle history,
  audit event, and idempotency record are committed atomically.
- Public projections still exclude provenance, visibility, internal notes,
  restricted evidence, locators, checksums, and processing metadata.

Private headers are a development authentication adapter only. In production,
they are ignored unless `MAYDAY_TRUST_DEV_HEADERS=true`; authorization remains
the gateway policy's responsibility.

See [architecture](docs/architecture.md), [gateway](docs/gateway.md),
[publication contract](docs/publication-contract.md),
[persistence](docs/persistence.md), [audit](docs/audit.md),
[evidence registry](docs/evidence-registry.md), and
[Research Studio integration](docs/research-studio-integration.md).
