---
name: archive-phases
description: "Move completed phase sections from a feature's workplan.md to workplan-archive.md; update the workplan-archive-ledger comment so the auto-positioner doesn't collide with archived fix-task IDs"
---

# /dw-lifecycle:archive-phases

Productizes the manual archive operation (the 2026-06-03 manual archive that reduced this feature's workplan from 4477 → 1036 lines). Moves selected `## Phase N:` sections out of the active `workplan.md` into a sibling `workplan-archive.md`; updates the `<!-- workplan-archive-ledger -->` annotation in the active workplan to record the new archived range + the next fix-task ID. The auto-positioner in `promote-findings` reads the ledger to avoid colliding with archived fix-task IDs (Phase 26 Task 4).

## Steps

1. Confirm the slug + the phase range to archive. Default is a dry-run that reports planned moves without writing.

2. Run the verb:

   ```bash
   dw-lifecycle archive-phases --feature <slug> --phases <range> [--apply]
   ```

   `--phases` accepts a comma-and-hyphen range: `1,2,5`, `1-5,7,9-10`, etc.

3. By default, the verb refuses to archive a phase that carries ANY unchecked task (`- [ ]`). The refusal surfaces the count of unchecked tasks per phase + lists each unchecked Step. The cure path is either:
   - Check off the unchecked steps (the phase actually IS complete; the workplan just wasn't updated), then re-run.
   - Pass `--allow-vestigial "<reason ≥40 chars>"` to archive a vestigial-but-incomplete phase (the case Phases 17/22/23 needed under Phase 24's no-git-hook-enforcement retirement).

4. The `--allow-vestigial` reason is validated:
   - Must be ≥40 characters of substantive prose.
   - Placeholder phrases (`TBD`, `fix later`, `placeholder`, etc.) are rejected.
   - The reason is recorded in the verb's report; future ledger schemas will store the per-phase reason inline.

5. `--apply` performs the move:
   - Cuts the `## Phase N:` section from `workplan.md` (heading line through the line before the next phase heading or EOF).
   - Appends the section to `workplan-archive.md` (creates the file with frontmatter if missing).
   - Updates the workplan's `<!-- workplan-archive-ledger -->` block: `archived-phases` merges in the new IDs (compacted into ranges); `archived-fix-tasks` + `next-fix-task-id` + `archive-file` + `note` all preserved.

6. Confirm the report. The report shape per phase:
   - `archived` — all-checked phase, moved successfully.
   - `allowed-vestigial` — incomplete phase moved under `--allow-vestigial`.
   - `refused-incomplete` — incomplete phase NOT moved (no `--allow-vestigial`).
   - `not-found` — phase number wasn't found in the workplan.

## Flags

| Flag | Purpose |
|---|---|
| `--feature <slug>` | Required. Resolves `docs/<v>/<status>/<slug>/`. |
| `--phases <range>` | Required. Phase IDs to archive: `1,2,5` or `1-5,7,9-10`. |
| `--repo-root <path>` | Project root. Default: cwd. |
| `--apply` | Perform the move. Default is dry-run. |
| `--allow-vestigial <reason>` | ≥40-char reason allowing archive of incomplete phases (retired-vestigial case per AUDIT-37). |

## Exit codes

- `0` — scan / archive complete (dry-run OR apply with no refusals).
- `1` — refused (incomplete phase without `--allow-vestigial`; or write failure).
- `2` — usage / config error (missing flag; bad range; unknown slug).

## When to use

- A feature's workplan has grown unwieldy (>2000 lines, or fix-task blocks pushing live phases past the visible window) — archive completed phases to slim the active surface.
- Phase 24's retirement decision rendered earlier phases vestigial (17/22/23) — use `--allow-vestigial` with the retirement reason.
- `/dw-lifecycle:complete` invokes this verb to archive ALL phases at feature-completion time so the `003-COMPLETE/` archive doesn't carry a 4000-line workplan.

## Cross-references

- Sibling: `/dw-lifecycle:unarchive-phases` (symmetric reversal).
- Doctor rule: `workplan-archive-ledger-coherence` (validates the ledger matches the archive file's actual content).
- Auto-positioner integration: `promote-findings`'s `computeAutoPosition` reads the ledger to avoid collisions with archived IDs (Phase 26 Task 4).
- Spec: `docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md` § Phase 26.
- AUDIT-37: the `--allow-vestigial` escape mechanizes the "completed OR vestigial" framing the `workplan-archive.md` header already sanctions.
