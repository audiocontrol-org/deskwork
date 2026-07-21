---
id: TASK-473
title: fleet-registry-atomic-write
status: Done
assignee: []
created_date: '2026-07-21 03:26'
updated_date: '2026-07-21 04:34'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - plugins/stack-control/src/plane/fleet-registry.ts
ordinal: 472000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
writeJsonFile uses direct writeFileSync (not tmp+rename). Two concurrent operator CLI invocations (plane issue-enrollment racing plane revoke) read-modify-write enrollment.json with no lock; last-writer-wins can silently drop a credential or a revocation. Plane-vs-CLI is already race-free (separate files); this closes only the operator-vs-operator window. Fix: tmp-write + renameSync. Surfaced by 037 multi-host enrollment final whole-branch review.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed in 6a45604a: enrollment.json now written atomically (tmp+rename).
<!-- SECTION:NOTES:END -->
