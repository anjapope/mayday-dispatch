# Audit events

Every successful publication mutation writes an audit event in the same SQLite
transaction as the mutation. Events contain:

- timestamp;
- actor subject, roles, and application;
- action and publication ID;
- correlation and request IDs;
- previous and resulting version;
- outcome, and optional reason/error code.

Audit payloads intentionally exclude request bodies, publication body/internal
notes, authentication material, private evidence contents, locators, and
checksums. A failed audit write prevents the publication mutation and surfaces
`AUDIT_FAILURE`; raw database errors are not returned.

The event schema supports `succeeded`, `rejected`, and `failed` outcomes for
future security-event sinks. Phase Three's atomic repository event records the
successful state-changing operation; transport/provider rejection logging can
be connected to a dedicated append-only sink without weakening transaction
guarantees.
