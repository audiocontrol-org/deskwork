# Contract — roadmap CLI (cluster + self-documenting help)

The CLI surface this feature adds/changes. These are the observable contracts tests assert against (the operator-perceivable behavior, per the project's spec-compliance-probe discipline).

## `stackctl roadmap cluster` (alias `group`)

```
stackctl roadmap cluster <parent-id> --children <id,...> [--chain] [--summary <text>] [--apply]
```

- **Default = dry-run.** Without `--apply`: print the intended mutation (parent create-or-reuse; each `part-of` edge; each `--chain` `depends-on` edge) and write nothing. Exit 0.
- **`--apply`:** perform the mutation atomically (build→revalidate→write); on success print what changed; exit 0.
- **create-or-reuse parent:** absent → create `planned` (with `--summary` description if given, else bare); present → group under it; never duplicated.
- **children:** each gains `part-of: <parent-id>`; a child already `part-of` a *different* parent gains the edge alongside (multi-parent); an exact-duplicate edge is a no-op.
- **`--chain`:** wire `depends-on` in argument order (`a→b→c`); REFUSE (clear error, exit 2, zero write) if a child already carries a conflicting `depends-on`.
- **refusals (exit 2, byte-for-byte unchanged file):** missing/empty `--children`; a `--children` id that does not exist; `parent-id` equals a child; any mutation producing a cycle / dangling / self-edge.
- **exit codes:** `0` success/dry-run; `2` usage/refusal; `1` unexpected internal error (fail-loud, Principle V — never a silent skip).

## `stackctl roadmap --help` / usage / per-subaction help (self-documenting)

- `stackctl roadmap --help` and `-h` → print every sub-action with a one-line summary; exit 0 (not "unknown flag").
- `stackctl roadmap` (no sub-action) → usage line enumerating the COMPLETE sub-action set (not a truncated subset); exit `2` (usage) with the full list on stderr.
- `stackctl roadmap <subaction> --help` → that sub-action's flags + any enumerated vocabulary (e.g. the status set on `advance`/`add`); exit 0.
- **non-drift invariant:** for every sub-action, the flags shown in `--help` are exactly the flags the parser accepts (no shown-but-unparsed, no parsed-but-unshown). Mechanically checkable.

## Honest-interim `ROADMAP.md` header (FR-016)

The governed header names the available mutation verbs, includes a worked `cluster` example, and states the fallback: *"for an edit without a verb yet (e.g. moving a part-of/depends-on edge): edit this file, then run `stackctl roadmap order` to revalidate."* Replaces the bare *"manage with stackctl roadmap — do not hand-edit."*

## Non-regression (FR-006)

Verbs not yet migrated onto the parser library dispatch and behave exactly as before. Existing `roadmap` sub-actions (`next`/`blocked`/`order`/`graph`/`add`/`advance`/`decompose`/`reclassify`/`defer`/`reconcile`/`close-related`) keep their current behavior and flags after the migration.
