---
id: TASK-165
title: >-
  026: reconcile deprecated speckit-guard to read the file marker (not the
  legacy env var) so its decision matches the 026 interceptor
status: To Do
assignee: []
created_date: '2026-06-18 03:49'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After 026 T017, speckit-guard resolves viaFrontDoor from the legacy env var STACKCTL_FRONT_DOOR==='1', while the 026 interceptor + mediate-check resolve it from the session-keyed marker FILE (activeCapabilities). The front-door skills now set the FILE marker. So a caller of the still-exposed /stack-control:speckit-guard verb after a legitimate 'front-door enter' is REFUSED (the file marker doesn't satisfy the env-var check) — two 'same decision' surfaces disagree (AUDIT-BARRAGE-claude-04, 026 Phase-3). speckit-guard is deprecated (superseded by the interceptor) and its CLI signature is frozen (no --session), which is why it still reads the env var. Reconciliation: give speckit-guard an optional --session/--at and resolve viaFrontDoor from activeCapabilities (the file) when provided, so the frozen contract's DECISION matches 026; or retire the env path entirely once no caller depends on it. Low-urgency (the interceptor is the live path); fixes a standing inconsistency on a deprecated verb.
<!-- SECTION:DESCRIPTION:END -->
