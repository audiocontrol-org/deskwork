---
id: TASK-317
title: >-
  govern finding-lift has no cross-run dedup — convergence iterations multiply
  near-duplicate backlog tasks (gh-490)
status: Done
assignee: []
created_date: '2026-06-20 03:53'
updated_date: '2026-06-21 03:16'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - 'https://github.com/audiocontrol-org/deskwork/issues/490'
ordinal: 317000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each barrage run lifts findings independently with no cross-run dedup, so convergence iterations multiply near-duplicate backlog tasks. Observed in 028: the dampener slushed TASK-303..312, several duplicating findings ALREADY FIXED in the same loop (compounds TASK-149 govern-dampener-in-loop). Fix: dedup lifted findings against prior runs of the same feature (by finding signature) AND against in-loop fixes before creating backlog tasks. GitHub gh-490.
<!-- SECTION:DESCRIPTION:END -->
