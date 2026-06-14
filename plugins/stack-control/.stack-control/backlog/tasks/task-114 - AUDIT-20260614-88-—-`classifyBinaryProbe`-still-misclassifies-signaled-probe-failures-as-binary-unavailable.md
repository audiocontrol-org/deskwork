---
id: TASK-114
title: >-
  AUDIT-20260614-88 — `classifyBinaryProbe()` still misclassifies signaled probe
  failures as "binary unavailable"
status: Done
assignee: []
created_date: '2026-06-14 18:32'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-88'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-88'
priority: medium
ordinal: 114000
---

Fixed in `ca0b373e`: `classifyBinaryProbe()` now treats `status === null` (with an
optional `signal`) as a probe-infrastructure failure alongside `result.error`,
instead of falling through to `status === 0` → "unavailable". A signal-killed
`which` probe throws rather than masquerading as lane absence. Covered by a new
test case; the round-3 phase-1 barrage re-audited and both lanes confirmed the
fix. Stale-open dupe of a same-session fix; closed on triage.

