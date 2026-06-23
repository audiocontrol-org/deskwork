# Contract: `stackctl roadmap resolves` (populate `closes:`)

Records resolved backlog ids onto a node's prose `closes:` set without a hand-edit
and without misusing the unit-edge machinery (which correctly refuses the prose
`closes` field).

## `stackctl roadmap resolves <id> [--add TASK-… …] [--remove TASK-… …] [--apply]`

- **Input**: a roadmap node `<id>`; one or both of `--add` / `--remove` with one or
  more backlog ids.
- **Behavior**: parse the node's existing `closes:` comma-list; apply set-union for
  `--add` and set-difference for `--remove`; rewrite the `- closes: a, b, c` body line
  canonically (trimmed, deduped, stable order). Create the `closes:` line if absent;
  remove it if it becomes empty.
- **Dry-run (default)**: print the before → after `closes:` set; write nothing.
- **`--apply`**: write the change to `ROADMAP.md`.

**Exit codes**: `0` success; `1` fail-loud (node not found, unreadable roadmap,
neither `--add` nor `--remove` given); `2` usage error.

## Invariants

- Operates ONLY on the prose `closes:` field — never routed through `add-edge`
  (`closes` is `references: prose`, not a unit-reference edge).
- Idempotent: `--add` of an already-present id and `--remove` of an absent id are
  no-ops (reported, not errors).
- Adding an id does NOT validate it against the backlog (the node may record an id
  before it exists); validation happens at close time (the cascade's `unknownIds`).
