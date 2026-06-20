---
id: TASK-312
title: >-
  Make InterceptDeps.resolveInstalled required (end the recurring diff-window
  false-alarm)
status: To Do
assignee: []
created_date: '2026-06-19 22:28'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 312000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Across 028 US3 govern rounds 2-4, claude repeatedly flagged HIGH that InterceptDeps.resolveInstalled is optional with a ?? true default and that the production stackctl intercept entry point might not wire it. This is a VERIFIED FALSE ALARM: src/subcommands/intercept.ts (runIntercept) DOES supply { resolveActive, resolveInstalled } and intercept.test.ts covers the no-installation permit — the auditor only flags it because that file is outside the per-phase diff window (TASK-146 recurring-false-alarm class). Structural root-fix to END the recurring false alarm + remove the real (if currently-wired) silent-default risk: make resolveInstalled a REQUIRED field on InterceptDeps (and consider the same for MediateCheckDeps), updating the ~15-20 test call sites to pass it explicitly. Then no caller can omit it and the auditor cannot infer a missing wire. Non-blocking; deferred from US3 to avoid the test-churn mid-phase.
<!-- SECTION:DESCRIPTION:END -->
