---
id: TASK-115
title: >-
  AUDIT-20260614-89 — The required fleet-knowledge seed is no longer documented
  as a setup artifact
status: Done
assignee: []
created_date: '2026-06-14 18:32'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-89'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-89'
priority: low
ordinal: 115000
---

Fixed in `ca0b373e`: dropped the stale "bundled template is a setup seed" wording
from the missing-file error/comment in `src/govern/lane-capabilities.ts`, and
added `fleet_knowledge` (`.stack-control/fleet-knowledge.yaml`) to the
managed-set table in `skills/setup/SKILL.md`. Stale-open dupe of a same-session
fix; closed on triage.

