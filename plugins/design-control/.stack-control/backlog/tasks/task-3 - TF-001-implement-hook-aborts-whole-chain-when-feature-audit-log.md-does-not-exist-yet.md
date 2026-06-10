---
id: TASK-3
title: >-
  TF-001: implement-hook aborts whole chain when feature audit-log.md does not
  exist yet
status: To Do
assignee: []
created_date: '2026-06-10 17:47'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - >-
    specs/001-design-control/audit-log.md is fine now; repro in
    specs/001-design-control/tooling-feedback.md TF-001
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First barrage of every new feature strands its findings: barrage fires clean, audit-barrage-lift fails on missing audit-log.md, hook aborts, and the no-new-diff guard skips the re-run. Inherited by stackctl audit-barrage-lift unless fixed there.
<!-- SECTION:DESCRIPTION:END -->
