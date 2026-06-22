---
id: TASK-425
title: >-
  audit-barrage run-dirs accumulate unboundedly under .stack-control/audit-runs
  with no prune/retention verb
status: Done
assignee: []
created_date: '2026-06-22 05:48'
updated_date: '2026-06-22 21:07'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 425000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The audit-barrage persists every run-dir (PROMPT.md, INDEX.md, per-model model-*.md, stderr/) under <install>/.stack-control/audit-runs/<stamp>-<slug>/ as the lift source + manual-triage evidence, and never deletes them. There is no stackctl audit-runs prune, no max-runs cap, no GC. They are gitignored (**/.stack-control/audit-runs/) so they never pollute git, but they grow without bound on disk. Observed in the feature/stack-control worktree: 279 run dirs / 108 MB. Proposed: a stackctl audit-runs prune (and/or retention-cap) verb, e.g. keep-last-N or older-than-T, surfaced through the backlog/curate capability surface. Surfaced 2026-06-22 while answering whether govern leaves clones/worktrees on disk (it leaves no clones/worktrees — only these run-dir artifacts).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed 2026-06-22 (commit c1d94f08): added stackctl audit-runs list|prune retention verb + skill; RED-first pure-selection + CLI tests; +findings fixes 7ea18fe5.
<!-- SECTION:NOTES:END -->
