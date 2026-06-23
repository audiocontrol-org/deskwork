---
id: TASK-446
title: >-
  workflow advance records status:shipped without merge/CI evidence
  (AUDIT-20260623-05)
status: To Do
assignee: []
created_date: '2026-06-23 21:48'
updated_date: '2026-06-23 21:48'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 445000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
FR-017 honest-boundary residual on the record-without-merge side. workflow advance --apply (the graduate primitive, also the sanctioned US3 reconcile path) records status:shipped with no proof the PR merged. Spec scopes this out: FR-013 (recording is remote-independent) + FR-017 (the load-bearing guarantee is the backstop, not merge-interception). A merge-evidence token would contradict FR-013 and break the no-remote reconcile. Proper home: the filed point-of-invocation interception follow-on (design:gap/speckit-bypass-point-of-invocation-refusal) — mediate a raw workflow-advance graduate so an autonomous agent off the ship-skill surface cannot record shipped without the operator-owned merge. Override-graduated in 032.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Node:** multi:feature/ship-stage
<!-- SECTION:NOTES:END -->
