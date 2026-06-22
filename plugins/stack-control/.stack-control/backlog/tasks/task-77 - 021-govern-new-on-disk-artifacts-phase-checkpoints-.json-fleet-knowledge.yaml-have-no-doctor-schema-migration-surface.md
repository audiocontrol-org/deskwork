---
id: TASK-77
title: >-
  govern: fleet-knowledge.yaml has no doctor/schema/migration surface
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
Re-scoped 2026-06-22: phase-checkpoints/*.json deleted by 030 US2 (moot). Surviving gap: fleet-knowledge.yaml is only light-verified at setup (setup/scaffold.ts:124, verify.ts:44 verifyFleetKnowledge) but has no full schema validation or doctor rule. A malformed/missing fleet-knowledge.yaml fails late inside governance instead of being caught by install/doctor discipline. Especially risky on upgrade: an older installation can carry no or invalid fleet-knowledge.yaml until an audit run fails on it. Add fleet-knowledge.yaml to the doctor/schema pipeline + setup/migration flow. See also TASK-113 (possible dup — same surviving gap).
<!-- SECTION:DESCRIPTION:END -->
