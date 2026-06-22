---
id: TASK-245
title: >-
  per-phase govern excludes the phase's own tests from the audited payload —
  auditors perpetually flag 'no test' (false positive)
status: Done
assignee: []
created_date: '2026-06-18 23:37'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
027 Phase 1 govern repeatedly surfaced a 'module ships validators with no test' finding even though tests/cli/command-adapter.test.ts exists, is committed, and passes (9 GREEN). Root cause: stackctl govern --phase scopes the payload to the phase's declared source files; tests live in tests/ and are excluded as out-of-phase ('path-scope excluded ... tests/cli/command-adapter.test.ts'). So every phase's audit is blind to that phase's tests and can always (falsely) flag missing coverage. Consider including test files that correspond to a phase's scoped sources in the per-phase payload, or teaching the lift to suppress 'no test' when a sibling test exists. Related: TASK-70, TASK-160.
<!-- SECTION:DESCRIPTION:END -->
