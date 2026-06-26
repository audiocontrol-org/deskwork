---
id: TASK-126
title: >-
  Floor-shortfall terminal prints outage-specific recovery advice ('check model
  CLIs are installed/reachable')
status: Done
assignee: []
created_date: '2026-06-15 00:42'
updated_date: '2026-06-26 00:28'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-5 audit, codex-gpt5 MEDIUM. protocol.ts barrage-nonzero branch splits fleet-floor-shortfall vs barrage-outage (T028), but the recovery sentence 'Check that the configured model-family CLIs are installed and reachable' is outage-specific and ships for BOTH. A floor shortfall means coverage WAS produced but fewer than the cross-model floor; its recovery is widen the fleet / lower --require-models, not 'install the CLIs.' Make the recovery guidance conditional on isFloorShortfall.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed: Fixed in c1d380fa (H3 fleet floor-vs-outage split single-sourced)
<!-- SECTION:NOTES:END -->
