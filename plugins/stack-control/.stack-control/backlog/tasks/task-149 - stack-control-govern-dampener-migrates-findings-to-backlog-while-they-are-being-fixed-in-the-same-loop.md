---
id: TASK-149
title: >-
  stack-control: govern dampener migrates findings to backlog while they are
  being fixed in the same loop
status: Done
assignee: []
created_date: '2026-06-16 23:37'
updated_date: '2026-06-21 03:16'
labels:
  - 'type:imported-issue'
  - promoted
dependencies: []
references:
  - gh-471
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

During a single `stackctl`/`govern` convergence loop, the spec-governance dampener auto-migrated MEDIUM findings to the local backlog *while those same findings were being fixed in the same loop*. This created stale backlog tasks for work that was already landing, requiring a manual "close as already-fixed" pass afterward.

## Context

Driving the Phase-4 govern loop for `design-control` (8 cross-model rounds to convergence), the loop is: `govern` (barrage → lift findings) → fix surfaced findings → re-`govern`. The HIGH findings gate the loop; MEDIUM findings are non-gating residuals.

The dampener slushed the non-HIGH (MEDIUM) residuals into the backlog as `migrated-finding` tasks (TASK-30…35) on the rounds where they were still open. But those same MEDIUM findings were fixed in the very next fix-step of the same loop (e.g. AUDIT-...-18 backslash, -19 per-viewport coverage, -21 dup-viewport-id, -22 misspelled-block, -24 status-strict, -26 govern-scope line — all fixed in commits within the loop).

Net effect: the backlog accumulated 6 tasks for work that was done minutes later in the same session. The audit-log entries had to be re-dispositioned from `migrated-to-backlog TASK-NN` to `fixed-<sha>`, and the backlog tasks had to be marked Done by hand (the `backlog` verb has no close/done subaction, so this required editing the task frontmatter directly).

## Repro

1. Run a `govern` convergence loop that surfaces MEDIUM findings alongside the gating HIGH.
2. Fix the MEDIUM findings in the same loop (as the scope-don't-defer discipline requires).
3. Observe: the MEDIUMs were already migrated to backlog as `migrated-finding` tasks, now stale.

## Impact

- The installation-scoped backlog is meant to be a burn-down queue the operator selects out of; auto-populating it with same-loop-fixed work pollutes that signal.
- There is no CLI affordance to close a backlog task (`backlog <capture|list|import-github|import-slush|promote>` only), so cleanup requires hand-editing frontmatter.

## Suggested fix (one or more)

- Defer the MEDIUM-residual migration until the loop reaches a terminal (converged/overridden), so findings fixed within the loop are never migrated.
- Or: when an audit-log finding flips to `fixed-<sha>`, auto-close (or reconcile) any backlog task whose `references:` points at that finding id.
- Add a `backlog done <id>` (or `backlog close <id> --reason`) subaction so already-fixed migrated findings can be closed without editing the store by hand.

Found while dogfooding `design-control` Phase-4 governance (8-round convergence, 2026-06-14).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** roadmap:multi:gap/govern-dampener-in-loop
<!-- SECTION:NOTES:END -->
