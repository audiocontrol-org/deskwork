# CLI Contract: `stackctl backlog promote`

The vendor-neutral core (FR-010). The `/stack-control:backlog` skill is a thin adapter that quotes this verb and adds no behavior.

## Synopsis

```text
stackctl backlog promote <item-id> [<item-id>...] --to <target-ref> [--apply]
```

- `<item-id>` — one or more backlog item ids (`TASK-<n>`). Multiple ids are valid **only** with a `tasks:` target (batch, D5).
- `--to <target-ref>` — required. One of:
  - `spec:specs/NNN-slug` — graduate to a new feature spec.
  - `tasks:specs/NNN-slug` — add as a task to an existing feature's `tasks.md`.
  - `roadmap:<phase>:<kind>/<slug>` — graduate to a roadmap node.
- `--apply` — write. **Absent ⇒ dry-run** (report intended change, write nothing) (FR-008).

## Behavior

- **Record-only** (FR-004): writes the backlog-side linkage on each item — adds the `promoted` label and a `- **Promoted-to:** <target-ref>` body bullet. Does **not** create the target. Preserves all pre-existing fields (FR-013).
- **Dry-run (default)**: prints, per item, the linkage that *would* be written + a note if the target path does not yet exist (D4). Zero writes.
- **Apply**: performs the writes. Batch (`tasks:`) is **all-or-nothing** — validate every item first; if any fails a precondition, refuse the whole batch with zero writes (SC-002).
- **Target existence**: shape-validated, not required to exist (D4). A non-existent target path is reported as pending-create, not an error.

## Exit codes

| Code | Condition |
|---|---|
| `0` | Promotion recorded (apply), or dry-run reported successfully. Includes the "target does not yet exist, recorded anyway" advisory case. |
| `1` | Fail-loud runtime error: a named item does not exist; the backlog store / a task file is malformed (`BacklogError`); a write failed. Zero partial writes. |
| `2` | Usage error: missing `--to`; malformed/unknown `<target-ref>` kind; multiple item-ids with a non-`tasks:` target; an already-`promoted` item (re-promotion refused, FR-006); no item-id given. |

## Idempotency / guard (FR-006)

- Promoting an item that already carries the `promoted` label is **refused** (exit 2, zero write, message naming the existing target). No duplicate or conflicting linkage.
- In a batch, if any item is already promoted, the whole batch is refused before any write.

## Invariants

- No invocation produces a partial write (SC-002).
- `stackctl backlog promote` runs to completion in a plain shell — no Claude Code surface required (CLI-first).
- The verb never creates the target and never reimplements `define` / `roadmap add` (FR-004, Principle VIII).

## Test list (RED-first; drives tasks.md)

1. dry-run reports the intended linkage and writes nothing.
2. `--apply` adds the `promoted` label + `Promoted-to:` bullet; preserves existing labels/refs/body (FR-013).
3. non-existent item → exit 1, zero write.
4. malformed store / task file → exit 1 (`BacklogError`), zero write.
5. missing `--to` → exit 2.
6. malformed/unknown target ref → exit 2.
7. already-promoted item → exit 2, zero write (FR-006).
8. multiple ids with `spec:`/`roadmap:` → exit 2 (batch only valid for `tasks:`).
9. batch `tasks:` with all valid ids → all promoted (apply); one invalid id → whole batch refused, zero write (SC-002).
10. target path absent → recorded with a pending-create advisory, exit 0 (D4).
11. each of the three target kinds (`spec:` / `tasks:` / `roadmap:`) records the correctly-typed ref.
