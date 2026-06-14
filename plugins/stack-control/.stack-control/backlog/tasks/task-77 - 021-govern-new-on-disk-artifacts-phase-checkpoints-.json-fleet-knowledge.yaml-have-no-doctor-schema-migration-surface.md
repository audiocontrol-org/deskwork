---
id: TASK-77
title: >-
  021/govern: new on-disk artifacts (phase-checkpoints/*.json,
  fleet-knowledge.yaml) have no doctor/schema/migration surface
status: To Do
assignee: []
created_date: '2026-06-14 18:22'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AUDIT-BARRAGE-codex-03 (MEDIUM, 021 phase-1). writePhaseCheckpoint() JSON records and fleet-knowledge.yaml are only validated at point-of-use during a govern run. Malformed/stale/missing files fail late inside governance instead of being caught by install/doctor discipline. Especially risky on upgrade: an older installation can carry no fleet-knowledge.yaml until an audit run touches it. Add both artifacts to the doctor/schema pipeline + setup/migration flow so missing/stale/malformed state is caught before govern depends on it. Separate scope from the phase-1 HIGH burndown (fixed in 9ee709f0).
<!-- SECTION:DESCRIPTION:END -->
