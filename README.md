# Mayday Dispatch

Mayday Dispatch is a domain-first publishing service for evidence-led research,
OSINT reports, and operational dispatches. Phase Four connects Research Studio
to Dispatch's authenticated HTTP gateway, durable SQLite persistence, Evidence
Registry API, structured operations logging, and editorial synchronization
locking while retaining the domain and gateway boundaries.

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
| `npm run test:integration` | Run the Research Studio HTTP-to-SQLite integration suite |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the production application |

## Phase Four guarantees

- Every mutation supplies `expectedVersion`; stale writes return
  `STALE_VERSION` without changing durable state.
- The origin tuple remains unique. Reusing it without `expectedVersion` returns
  `ORIGIN_CONFLICT`; supplying the current version is an intentional origin
  revision.
- `Idempotency-Key` is optional and scoped to the authenticated actor. An exact
  replay returns the original result; reusing the key for a different payload
  returns `IDEMPOTENCY_CONFLICT`.
- Evidence must already exist in an `EvidenceRegistry` and is associated by its
  stable UUID. Dispatch accepts no binary or raw upload payload.
- Publication state, revision snapshot, relationships, lifecycle history,
  audit event, and idempotency record are committed atomically.
- Public projections still exclude provenance, visibility, internal notes,
  restricted evidence, locators, checksums, and processing metadata.
- Research Studio authenticates with a configured bearer token or signed HMAC
  request. Credential records establish identity; gateway policies separately
  authorize actions.
- External synchronization is permitted only for drafts. Non-draft
  synchronization returns `EDITORIAL_LOCK` with the publication ID, current
  version, and lifecycle state.

The Node `node:sqlite` API is experimental. This phase targets Node runtimes
that provide `DatabaseSync` (Node 22.5+) and retains the repository
abstraction so the driver is not exposed to gateway callers.

See [architecture](docs/architecture.md), [gateway](docs/gateway.md),
[publication contract](docs/publication-contract.md),
[persistence](docs/persistence.md), [audit](docs/audit.md),
[evidence registry](docs/evidence-registry.md),
[service authentication](docs/service-authentication.md),
[operations](docs/operations.md), and
[Research Studio integration](docs/research-studio-integration.md).
