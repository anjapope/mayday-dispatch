# Mayday Dispatch

Mayday Dispatch is a domain-first publishing service for evidence-led research,
OSINT reports, and operational dispatches. Phase Seven makes Mayday3 a
controlled, versioned evidence provider while preserving Dispatch's editorial
authority. Phase Six completes Dispatch's
editorial control room: authenticated intake and review, versioned editorial
changes, readiness-gated publication, public-safe previews, durable audit and
revision history, corrections, substantive updates, and archival. Research
Studio and Overwatch remain draft-only upstream clients of the same gateway.

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
| `npm run test:integration` | Run the authenticated HTTP-to-SQLite integration suite |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run lint` | Run ESLint |

The authenticated editorial queue and readiness review are documented in
[docs/editorial-workspace.md](docs/editorial-workspace.md).
Publication lifecycle operations are documented in
[docs/publication-operations.md](docs/publication-operations.md), with correction semantics in
[docs/corrections.md](docs/corrections.md).
| `npm run build` | Build the production application |

## Editorial guarantees

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
- Editors make version-checked, auditable changes to publication-facing
  content; origin identity and upstream assessment provenance remain immutable.
- Only publisher/admin actors may explicitly transition a ready publication to
  `published`. Readiness errors block that operation; warnings remain advisory.
- The editorial preview and public route share the same safe projection.
  Internal provenance, Overwatch assessment rationale, and restricted evidence
  are never rendered publicly.
- Corrections, substantive updates, lifecycle transitions, and archives are
  distinct revision/audit events. Archives retain history and have no hard
  delete or withdrawal workflow.
- Mayday3 can register and version processed evidence metadata only. It cannot
  publish, alter editorial content, transition publications, or expose private
  evidence. Evidence associations remain separate, authorized publication
  operations.

The Node `node:sqlite` API is experimental. This phase targets Node runtimes
that provide `DatabaseSync` (Node 22.5+) and retains the repository
abstraction so the driver is not exposed to gateway callers.

See [architecture](docs/architecture.md), [gateway](docs/gateway.md),
[publication contract](docs/publication-contract.md),
[persistence](docs/persistence.md), [audit](docs/audit.md),
[evidence registry](docs/evidence-registry.md),
[Mayday3 integration](docs/mayday3-integration.md),
[evidence provenance](docs/evidence-provenance.md),
[evidence discovery](docs/evidence-discovery.md),
[public site](docs/public-site.md),
[service authentication](docs/service-authentication.md),
[operations](docs/operations.md), and
[Research Studio integration](docs/research-studio-integration.md), and
[Overwatch integration](docs/overwatch-integration.md).
- Editorial workspace: authenticated queue, readiness review, evidence inspection, and lifecycle
  operations are documented in [docs/editorial-workspace.md](docs/editorial-workspace.md).
