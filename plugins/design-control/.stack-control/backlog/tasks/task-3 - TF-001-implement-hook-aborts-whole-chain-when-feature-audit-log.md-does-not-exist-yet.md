---
id: TASK-3
title: >-
  TF-001: implement-hook aborts whole chain when feature audit-log.md does not
  exist yet
status: Done
assignee: []
created_date: '2026-06-10 17:47'
updated_date: '2026-06-10 18:03'
labels:
  - agent-found
  - 'type:bug'
  - filed-upstream
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Filed upstream per the tooling-friction-goes-to-GitHub policy (2026-06-10): https://github.com/audiocontrol-org/deskwork/issues/441. Closed locally — not burnable in this installation.
<!-- SECTION:NOTES:END -->
