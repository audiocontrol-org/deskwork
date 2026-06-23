# Contract: backlog task parent-node ref + auto-back-link

A backlog task may carry an OPTIONAL reference to the roadmap node it belongs to.
When present, closing or promoting the task auto-back-links its id into that node's
`closes:` set — so the transitive closer has an auditable recorded set without a
hand-edit.

## Storage

- The ref is a structured linkage line in the task's implementation notes:
  `Node: <roadmap-id>` (reuses the promotion-linkage notes mechanism; read via the
  backend's raw-notes accessor, written via append/set-notes).
- OPTIONAL. A task with no such line has no parent-node ref.

## Write paths

- `stackctl backlog promote <id> --to spec:… [--node <roadmap-id>]` — records the
  parent-node ref as part of recording the promotion linkage. (If a node is implied
  by the promotion target, it MAY be set automatically; otherwise via `--node`.)
- `stackctl backlog capture … [--node <roadmap-id>]` — MAY set the ref at capture.

## Read path (auto-back-link)

- `stackctl backlog done <id> --reason <r>` — sets the task `Done` + appends the
  reason (unchanged), AND, **when the task carries a parent-node ref**, adds `<id>`
  to that node's `closes:` via the `roadmap resolves --add` mutation.
- Absence of the ref ⇒ no back-link, **no error** (a documented no-op — FR-011).

## Invariants

- The notes linkage line is the single source of the ref (no duplicate roadmap-side
  index).
- Auto-back-link is idempotent (adding an already-present id is a no-op).
- A back-link failure (e.g. the referenced node does not exist) is surfaced
  fail-loud, never silently swallowed.
