---
name: ship
description: "The one on-rail ship step: govern-converged precondition → open PR → operator confirms CI green → merge → non-discretionarily record status:shipped (fire graduate). Welds the merge to recording shipped so there is no skippable second step. No skip/defer/shortcut branch."
---

# /stack-control:ship

The single sanctioned **on-rail ship step**. It welds the PR merge to recording
`status: shipped` so the recording can never be skipped — the exact defect (work
merged + released while the status stayed `in-flight`, caught only by luck) that
motivated 032. Govern-converge is ship's **precondition**, not the event that
records shipped; **merge** is the event, and `graduate` (records `status: shipped`
+ reconcile + journal + commit) fires as one welded operation right after it.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the discipline lives in this
> skill body + the `stackctl workflow` verbs it calls — it travels with the plugin
> install, never a git hook. There is no skip/defer/shortcut branch anywhere here
> (the no-offroading rule).

## Compass precondition (the un-skippable lifecycle)

**Before doing ANY of this skill's work**, consult the compass for the roadmap item,
declaring this skill as the intent:

```bash
stackctl workflow compass <item> --intent ship
```

A **non-zero exit is a hard refusal**: print the compass's reason and **STOP —
perform none of this skill's work**. `ship` maps to the `merging` phase; an item
that is not yet govern-converged returns `ahead` (its `graduate-impl impl` gate is
unmet) and refuses — **you cannot ship un-governed work**. Proceed only on exit 0.

## Govern-converged check

The `graduate-impl impl` gate must be green (the item's whole-feature `impl`
convergence record exists). The compass precondition above already enforces this;
if you reach this skill some other way, refuse loud naming `govern`/`/stack-control:execute`
as the missing step. Recording `status: shipped` does **not** require a GitHub
remote (FR-013) — only the merge does.

## Steps (the weld — no skip/defer/shortcut branch)

1. **Open the PR** for the feature (operator-owned): `gh pr create …`, or surface the
   already-open PR for the branch.

2. **Operator confirms CI is green (FR-019).** Surface the PR / CI link and ask the
   operator to confirm CI is green before merging. There is **no poll** and no
   CI-status API coupling — CI here is slow and the merge is operator-owned. **If the
   operator does not confirm green, STOP and record nothing** (do not merge a
   red/pending PR).

3. **Merge** the PR (operator-owned merge): `gh pr merge …` (or the operator merges
   in the GitHub UI and tells you it is merged).

4. **Fire `graduate` — non-discretionarily, ON THE LIFECYCLE BRANCH.** Immediately run
   the `merging → validating` transition, which records `status: shipped`:

   ```bash
   stackctl workflow advance <item> --apply
   ```

   This fires the welded effect manifest — `roadmap-advance to=shipped;
   roadmap-reconcile; journal-append; commit` (commit last, the atomic boundary).
   Steps 3 and 4 are **one welded operation**: there is no branch that merges without
   the recording following, and the skill offers **no** "defer recording" option.

   **Git ordering (AUDIT-20260623-11) — the `graduate` commit must land where the
   roadmap is read.** The `commit` effect writes the `status: shipped` change to the
   ROADMAP the engine reads — so run `workflow advance` on the **branch that tracks the
   roadmap** (the long-lived lifecycle branch, or the default branch), NOT on a
   feature/PR branch that step 3 just merged-and-closed. The merge in step 3 consumed
   the PR head *as it was before* this commit, so a post-merge `graduate` commit left
   only on a discarded PR branch would never reach the trunk the merge updated — the
   roadmap on the lifecycle branch would say `shipped` while the trunk still reads
   `in-flight`, the exact split this feature exists to prevent. **If your workflow uses
   a per-feature branch, switch to the lifecycle/default branch before this step** (the
   roadmap status is a trunk-level fact, not feature-branch-local).

5. **Push the lifecycle branch to its remote** (commit/push early-and-often — the
   `commit` effect already committed locally):

   ```bash
   git push
   ```

   The push must put the `status: shipped` commit on the remote the next reader (the
   backstop, the next `workflow status`/compass, the next merge to trunk) consults. On
   the single-long-lived-branch model this is the dev branch itself (it syncs to trunk
   on the next merge); on a per-feature workflow, push the default branch you recorded on
   in step 4 — **not** a merged-and-closed feature branch.

## Postcondition

`status: shipped` is recorded on the roadmap node (+ journal + commit); the derived
phase is **`validating`** (the verify-before-close window); the compass reports the
item past merge. The next moves are the **separate** downstream skills:
`/stack-control:release` (bump/tag/publish) and `/stack-control:close` (after
validating).

## What ship does NOT do

- It does **not** cut a release (bump/tag/publish) — that is `/stack-control:release`.
- It does **not** close the item — that is `/stack-control:close`, after `validating`.
- It is **not** auto-run from `/stack-control:execute` — ship is operator-invoked
  because merge timing is operator-owned (FR-004).
- It offers **no** skip / defer / shortcut for the `graduate` recording (the
  no-offroading rule).

## Honest boundary (FR-017)

A deliberate raw `gh pr merge` performed **outside** this skill cannot be prevented;
that path leaves a merged-but-status-in-flight item. The load-bearing guarantee for
that residual is the **backstop** (see `specs/032-ship-stage/contracts/backstop-compass-invariant.md`):
it refuses forward lifecycle motion at the next workflow waypoint until the dangling
item is reconciled. The guarantee is the backstop gate, not interception of the merge.

## CLI-first

The CLI is the vendor-neutral core; this skill is a thin adapter that quotes
`stackctl workflow` verbs (`compass`, `advance`) and adds no behavior the CLI lacks.
`stackctl workflow advance <item> --apply` runs the weld from a plain shell.
