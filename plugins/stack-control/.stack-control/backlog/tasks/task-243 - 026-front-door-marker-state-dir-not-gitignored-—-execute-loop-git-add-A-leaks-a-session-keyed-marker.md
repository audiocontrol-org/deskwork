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
Re-scoped 2026-06-22: gitignore half DONE (**/.stack-control/state/ at root .gitignore:168). Surviving work: git ls-files shows state/front-door/57b16bd2-...json still tracked — run git rm --cached plugins/stack-control/.stack-control/state/front-door/57b16bd2-*.json (and any other tracked marker files) to complete the cleanup.
<!-- SECTION:DESCRIPTION:END -->
