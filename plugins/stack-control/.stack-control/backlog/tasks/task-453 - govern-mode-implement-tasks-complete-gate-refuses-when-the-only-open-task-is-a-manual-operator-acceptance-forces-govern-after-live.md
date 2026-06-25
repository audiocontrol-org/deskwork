---
id: TASK-453
title: >-
  govern --mode implement: tasks-complete gate refuses when the only open task
  is a manual operator-acceptance (forces govern-after-live)
status: Done
assignee: []
created_date: '2026-06-25 19:02'
updated_date: '2026-06-25 19:19'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-499
ordinal: 452000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`stackctl govern --mode implement` refuses with compass verdict `ahead` (`tasks-complete spec` unmet) when the **only** open item in `tasks.md` is a **manual operator-acceptance task** — e.g. an "operator live re-bless (manual, read-only)" task that, by design, a coding agent cannot complete in-session. This forces governance to run *after* the live operation, when the natural order is to audit the code *before* asking the operator to run it against production.

This is the same class as the previously-noted TASK-180; it recurred against a fresh feature (spec 006 capture-robustness, task T019) on 2026-06-23.

## Reproduction

1. Author a feature whose `tasks.md` ends with a manual operator-only acceptance task (e.g. `T019 Operator live re-bless (manual, read-only)`).
2. Implement and commit every other (code) task; the manual task stays `- [ ]`.
3. Run `stackctl govern --mode implement --item <id> --diff-base <pre-feature-sha>`.

**Observed:** 
```
govern: REFUSED — compass verdict 'ahead' for '<item>': 'governing' targets the legitimate next phase 'governing', but its exit gate is unmet (tasks-complete spec) — complete the current phase's work first
govern: terminal-outcome=fatal
```
The whole-feature cross-model audit never runs, even though all *code* tasks are complete and committed. `--override` is the prohibited offroad, so there is no sanctioned way to govern the code before the manual live step.

## Impact

You cannot get a cross-model code audit of the implementation before the operator runs the (often expensive, outward-facing, hard-to-reverse) live acceptance. The audit that would catch a defect before the live run is gated behind the live run.

## Possible directions

- Let `tasks-complete` distinguish **agent-completable** tasks from **manual/operator-acceptance** tasks (e.g. a `[manual]`/`[operator]` marker that the gate excludes, or counts as satisfied-for-govern), so govern can run once all code tasks are done.
- Or a sanctioned "govern the code now, the manual acceptance is tracked separately" path that is not `--override`.

## Environment

- stack-control 0.53.0 (deskwork plugin cache).
- Surfaced in `~/work/offing` (the prod-baseline thread), feature spec 006 task T019.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Duplicate of TASK-451 (same gate-eval.ts tasksComplete() defect: counts manual operator-acceptance checkboxes). gh-499 tracked here; canonical TASK-451 carries gh-501. Fix once, closes both issues.
<!-- SECTION:NOTES:END -->
