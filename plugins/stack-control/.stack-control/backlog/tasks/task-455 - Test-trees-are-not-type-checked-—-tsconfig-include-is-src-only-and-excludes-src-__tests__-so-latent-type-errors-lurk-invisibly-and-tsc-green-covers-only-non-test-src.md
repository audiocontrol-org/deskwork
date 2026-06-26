---
id: TASK-455
title: >-
  Test trees are not type-checked — tsconfig include is src only and excludes
  src/__tests__, so latent type errors lurk invisibly and 'tsc green' covers
  only non-test src
status: To Do
assignee: []
created_date: '2026-06-26 04:54'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 454000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during the H5 code review (2026-06-26). tsconfig.json include is ['src/**/*.ts'] and exclude lists 'src/__tests__/**', so neither src/__tests__ nor the top-level tests/ tree is type-checked by 'tsc --noEmit'. A test-tsconfig (rootDir '.', include src+tests) surfaces ~73 real type errors (missing required fields like auditHistory/selfHandlesHelp, BarrageInput.repoRoot, possibly-undefined index access). vitest uses esbuild so it strips types and never catches these. Consequence: 'tsc clean per commit' is a misleading signal — a test fixture omitting a genuinely-consumed required field ships silently (exactly how the H5 selfHandlesHelp fixtures were caught only by a manual test-tsconfig). Proposed: add a test typecheck config + local npm script (not CI, per the no-CI-test-infra rule) and burn down the existing ~73. Operator owns whether/when to scope this.
<!-- SECTION:DESCRIPTION:END -->
