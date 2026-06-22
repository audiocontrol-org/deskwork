---
id: TASK-395
title: AUDIT-20260621-32 — `graduate-impl` invalid-target error path is untested
status: To Do
assignee: []
created_date: '2026-06-21 02:06'
labels:
  - 'type:migrated-finding'
  - 'feature:029-govern-operability'
  - 'finding:AUDIT-20260621-32'
dependencies: []
references:
  - 'audit:029-govern-operability:AUDIT-20260621-32'
priority: low
ordinal: 395000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed STILL-VALID 2026-06-22 (uncertainty removed). The error path lives at gate-eval.ts:149-150 (throws WorkflowError when c.target !== 'impl'). graduate-gate.test.ts covers only the happy path: line 31-32 (MET when converged record exists) and line 35-36 (UNMET with no converged record). There is NO test passing an invalid target (e.g. target:'spec'/'design'/'invalid-name') asserting WorkflowError is thrown. The pattern to mirror exists in governance-fixes.test.ts:82-108 (invalid-target tests for section-present + tree-clean). Fix: add an invalid-target case to graduate-gate.test.ts.
<!-- SECTION:DESCRIPTION:END -->
