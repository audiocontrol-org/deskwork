# Feature Specification: Delete entries on completion (fixture: high-finding)

> Fixture spec for spec-governance tests — carries a seeded, obvious
> internal contradiction so that ≥1 model family flags a HIGH finding when
> barraged. Used by the end-to-end smoke (live models) and as a reference
> for the cross-model agreement scenario.

## User Scenarios

### US1 — Operator archives a finished document (P1)

As an operator, when a document reaches a terminal state I want it removed,
so the active list stays short.

## Requirements

- FR-001: When a document reaches the `Published` state, the system MUST
  **delete** the document record from the database so it no longer appears.
- FR-002: The system MUST preserve the **complete historical record** of
  every document that has ever existed, including published ones, so the
  database is an append-only audit trail that never loses history.
- FR-003: A `Published` document MUST be permanently removed (FR-001) and
  MUST remain queryable forever (FR-002).

## Success Criteria

- SC-001: After a document is published, querying it returns NOT FOUND.
- SC-002: After a document is published, the full history including that
  document is still retrievable.

> Seeded contradiction: FR-001/SC-001 (delete on publish → not found) directly
> contradicts FR-002/SC-002 (preserve forever → retrievable). FR-003 asserts
> both at once. A correct governance barrage flags this as a HIGH/BLOCKING
> internal contradiction.
