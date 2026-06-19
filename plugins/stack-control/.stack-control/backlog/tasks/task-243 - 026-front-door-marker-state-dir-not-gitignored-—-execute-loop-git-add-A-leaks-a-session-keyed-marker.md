---
id: TASK-243
title: >-
  026 front-door marker state dir not gitignored — execute-loop git add -A leaks
  a session-keyed marker
status: To Do
assignee: []
created_date: '2026-06-18 23:15'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 243000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plugins/stack-control/.stack-control/state/front-door/ is not covered by any gitignore. The execute (027) per-phase boundary commit uses git add -A, which sweeps the session marker into the commit; a stale marker 57b16bd2-...json is already tracked from a prior session. Fixed forward in 027 Phase 1 by adding **/.stack-control/state/ to the repo-root .gitignore; the already-tracked stale marker still needs a git rm --cached cleanup (not done in the Phase 1 scope commit).
<!-- SECTION:DESCRIPTION:END -->
