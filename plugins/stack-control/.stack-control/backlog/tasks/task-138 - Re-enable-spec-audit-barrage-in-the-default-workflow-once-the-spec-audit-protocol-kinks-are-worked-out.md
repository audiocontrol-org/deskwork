---
id: TASK-138
title: >-
  Re-enable spec audit-barrage in the default workflow once the spec-audit
  protocol kinks are worked out
status: To Do
assignee: []
created_date: '2026-06-16 00:57'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator decision 2026-06-16: spec-document audit-barrage (govern --mode spec) was parked from the default workflow because the spec-audit protocol on spec documents still has kinks (vs implementation, where audit-barrage stays). 022 keeps the symmetric mode-keyed govern-convergence record MECHANISM but makes the spec-govern gate opt-in: specifying->implementing derives from speckit-analyze-clean by default; governing->shipped (impl-govern) stays required. This item tracks re-enabling the spec-govern gate as default-required once the spec-audit protocol is reliable. Related: TASK-136 (022 parseable-lifecycle-workflow), spec-audit-diminishing-returns rule.
<!-- SECTION:DESCRIPTION:END -->
