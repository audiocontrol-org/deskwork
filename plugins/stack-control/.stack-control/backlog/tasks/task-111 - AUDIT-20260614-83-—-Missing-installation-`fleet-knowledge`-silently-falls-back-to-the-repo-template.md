---
id: TASK-111
title: >-
  AUDIT-20260614-83 — Missing installation `fleet-knowledge` silently falls back
  to the repo template
status: Done
assignee: []
created_date: '2026-06-14 18:32'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-83'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-83'
priority: medium
ordinal: 111000
---

Fixed in `9ee709f0`: `readFleetKnowledge()` no longer falls back to the bundled
`templates/fleet-knowledge.yaml` when the installation file is absent — it fails
loud pointing at `stackctl setup` (which seeds the file). The byte-identical
template was deleted. The round-3 phase-1 barrage re-audited and both lanes
confirmed the no-runtime-fallback contract holds. Stale-open dupe of a
same-session fix; closed on triage.

