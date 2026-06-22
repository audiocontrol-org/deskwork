---
id: TASK-119
title: >-
  AUDIT-20260614-92 — Fleet-floor vs outage classification still depends on a
  fragile stderr substring
status: To Do
assignee: []
created_date: '2026-06-14 20:20'
labels:
  - 'type:migrated-finding'
  - 'feature:audit-protocol-friction-burndown'
  - 'finding:AUDIT-20260614-92'
dependencies: []
references:
  - 'audit:audit-protocol-friction-burndown:AUDIT-20260614-92'
priority: medium
ordinal: 119000
---



## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Re-scoped 2026-06-22: the substring-anchoring risk (incidental match) was fixed — protocol.ts:370 now uses anchored /^audit-barrage: FLOOR SHORTFALL\b/m. Surviving root ask: the fleet-floor vs barrage-outage split still parses prose rather than a structured exit-code or typed marker. A crash / unexpected stderr layout could route floor-shortfall to the outage branch. Fix: emit a structured machine-readable terminal kind signal from the barrage layer (e.g. a JSON marker on stderr, or a dedicated exit code band) so the classification path does not depend on prose format.
<!-- SECTION:DESCRIPTION:END -->
