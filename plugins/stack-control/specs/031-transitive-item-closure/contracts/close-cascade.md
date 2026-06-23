# Contract: transitive close cascade

Two surfaces drive the same `transitive-close` engine: the explicit closure verb and
the terminal-stage advance. Both default to **dry-run**; both mutate only on
explicit `--apply`.

## `stackctl roadmap close-related <id> --cascade [--apply]`

- **Input**: a roadmap node `<id>` in a terminal status (`shipped`/`cancelled`/
  `retired`/`closed`).
- **Behavior**: walk the `part-of` subtree from `<id>` (visited-Set dedup); for each
  **terminal** node collect its `closes:` ids and close them; **skip-and-report**
  non-terminal children; apply **uniform terminal handling** to `cancelled`/`retired`
  members (close their ids too, with a status-reflecting reason).
- **Dry-run (default)**: print the `CascadePlan` — nodes to close (id, status, ids,
  reason), skipped non-terminal children (id, status), the deduped `closeIds`,
  `alreadyClosed`, and any `unknownIds`. Write nothing.
- **`--apply`**: close `closeIds` via `backend.close(id, reason)` (idempotent;
  `alreadyClosed` reported, not re-errored). Does NOT change the root's status (that
  is `advance`'s job).
- **Without `--cascade`**: unchanged single-node `close-related` behavior (closes only
  `<id>`'s own `closes:` ∪ `ref:`).

**Exit codes**: `0` success (dry-run or apply); `1` fail-loud (any `unknownIds`
present, unreadable roadmap/backlog, or `<id>` not terminal in the non-cascade arm);
`2` usage error.

## `stackctl roadmap advance <id> --to closed [--apply]`

- **Precondition**: `<id>` is in status `shipped` (compass refuses `closed` from any
  other phase).
- **Dry-run (default)**: print the same `CascadePlan` the cascade would apply — the
  operator-confirm guard. Write nothing.
- **`--apply`**: run the cascade (as above) AND set `<id>`'s status to `closed`. The
  lifecycle advance and the closure are one operator-confirmed action.
- **Guard**: `--to closed` MUST NOT mutate without `--apply` (no auto-close).

**Exit codes**: `0` success; `1` fail-loud (not `shipped`, `unknownIds`, unreadable
state); `2` usage error.

## Invariants

- Closure touches ONLY recorded `closes:`/`ref:` ids (never inferred — 023 FR-003).
- A non-terminal child never blocks the root's closure or advance (FR-007a).
- Re-running either surface is safe/idempotent (FR-004).
- No automatic closure on any other event (FR-016).
