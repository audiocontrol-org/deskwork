---
id: TASK-22
title: backlog promote target-path advisory is cwd-relative not install-root-relative
status: To Do
assignee: []
created_date: '2026-06-10 20:04'
updated_date: '2026-06-12 06:30'
labels:
  - agent-found
  - 'type:gap'
  - promoted
dependencies: []
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
promote's pending-create advisory (D4) resolves target.path against process.cwd(). Running promote from the installation subdir (plugins/stack-control) yields a false 'does not yet exist' advisory for a spec dir that exists at repo root. Non-blocking (record-only still writes correctly). Surfaced dogfooding 012 T021. Fix: resolve target.path against the resolved installation/repo root rather than raw cwd.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- **Promoted-to:** tasks:specs/016-anchor-unification
<!-- SECTION:NOTES:END -->
