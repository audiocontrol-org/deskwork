---
name: unarchive-phases
description: "Move phase sections from workplan-archive.md back to workplan.md at the correct numeric position; update the workplan-archive-ledger comment"
---

# /dw-lifecycle:unarchive-phases

Symmetric reversal of `/dw-lifecycle:archive-phases`. Moves selected `## Phase N:` sections from a feature's `workplan-archive.md` BACK to the active `workplan.md` at the correct numeric position (before the first existing phase with a higher number, or at end-of-file). Updates the workplan-archive-ledger by removing the unarchived phase from `archived-phases`; `next-fix-task-id` is preserved (IDs are forever-allocated per the design spec — even after unarchive, the fix-task IDs assigned to the unarchived phase are still in use).

## Steps

1. Confirm the slug + the phase range to restore.

2. Run the verb:

   ```bash
   dw-lifecycle unarchive-phases --feature <slug> --phases <range> [--apply]
   ```

3. The verb's report per phase:
   - `restored` — section found in archive + moved back to workplan.
   - `not-found-in-archive` — phase number wasn't in the archive file.

4. `--apply` performs the move:
   - Cuts the `## Phase N:` section from `workplan-archive.md`.
   - Inserts the section into `workplan.md` immediately before the first existing `## Phase M:` heading with `M > N`, or at EOF when no later phase exists.
   - Updates the workplan's `<!-- workplan-archive-ledger -->` block: removes the unarchived phase from `archived-phases` (splitting ranges as needed); preserves `archived-fix-tasks`, `next-fix-task-id`, `archive-file`, `note`.

## Flags

| Flag | Purpose |
|---|---|
| `--feature <slug>` | Required. Resolves `docs/<v>/<status>/<slug>/`. |
| `--phases <range>` | Required. Phase IDs to restore: `1,2,5` or `1-5,7,9-10`. |
| `--repo-root <path>` | Project root. Default: cwd. |
| `--apply` | Perform the restore. Default is dry-run. |

## Exit codes

- `0` — scan / restore complete.
- `2` — usage / config error (missing flag; bad range; unknown slug; missing archive file).

## When to use

- A previously-archived phase needs work resumed — restore it to the active workplan.
- The operator changed their mind about Phase 24's retirement of a phase — unarchive it back to active.
- Round-trip test on the archive operation (archive → unarchive → diff against original).

## Reversibility

`archive-phases X` + `unarchive-phases X` is a stable round-trip:
- Section content preserved verbatim.
- Phase reinserted at the correct numeric position (so `Phase 1, Phase 3, Phase 5` → archive Phase 3 → unarchive Phase 3 puts Phase 3 back between Phase 1 and Phase 5, not at EOF).
- Ledger's `archived-phases` returns to its pre-archive state.
- `next-fix-task-id` is preserved (NOT decremented; IDs are forever-allocated even after unarchive).

## Cross-references

- Sibling: `/dw-lifecycle:archive-phases` (creates the state this verb reverses).
- Doctor rule: `workplan-archive-ledger-coherence` (validates the ledger matches the archive file's actual content; surfaces drift after archive/unarchive operations).
- Spec: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` § Phase 26.
