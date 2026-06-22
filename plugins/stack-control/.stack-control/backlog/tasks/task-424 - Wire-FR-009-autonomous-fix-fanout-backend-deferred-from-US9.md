---
id: TASK-424
title: Wire FR-009 autonomous fix-fanout backend (deferred from US9)
status: To Do
assignee: []
created_date: '2026-06-22 02:50'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 424000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
US9 (030) wired the chunked end-govern AUDIT system with agent-in-the-loop fix (govern audits, surfaces override-eligible, the driving agent fixes, re-govern); applyFixes is undefined at the CLI. FR-009 autonomous govern-dispatched fix (real FixRunner: headless fix-subagent dispatch + git worktree lifecycle; real MergeAttempt: conflict-aware merge) is UNBUILT (worktree-dispatch.ts/merge-serialize.ts are orchestration over injected deps only). Operator deferred 2026-06-22. Revisit: build the backend OR amend spec to adopt agent-in-the-loop fix as canonical (execute already provides a fix loop).
<!-- SECTION:DESCRIPTION:END -->
