---
id: TASK-4
title: >-
  TF-002: audit-barrage-lift merges distinct findings under one ID, documents
  only one (systematic; 2 recurrences)
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
  - specs/001-design-control/tooling-feedback.md TF-002
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two consecutive barrages folded 5 distinct-mechanism findings into one entry whose body describes only one — a fixer trusting the merged body silently drops the rest. Fix that matters: do not fold distinct-mechanism findings even when cross-model. Inherited by stackctl audit-barrage-lift unless fixed there.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Filed upstream per the tooling-friction-goes-to-GitHub policy (2026-06-10): https://github.com/audiocontrol-org/deskwork/issues/440. Closed locally — not burnable in this installation.
<!-- SECTION:NOTES:END -->
