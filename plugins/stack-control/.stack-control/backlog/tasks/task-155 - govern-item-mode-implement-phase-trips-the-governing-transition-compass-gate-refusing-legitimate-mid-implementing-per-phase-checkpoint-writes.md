---
id: TASK-155
title: >-
  govern --item + --mode implement --phase trips the governing-transition
  compass gate, refusing legitimate mid-implementing per-phase checkpoint writes
status: To Do
assignee: []
created_date: '2026-06-18 01:08'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
govern.ts:609 runs checkLifecyclePrecondition(intent: govern) whenever --item is passed, mapping intent to the governing phase. For a per-phase IMPLEMENT govern (--mode implement --phase N) run DURING implementing, this is wrong: the run writes a phase checkpoint, it is not a transition to governing. From implementing the verdict is ahead (exit 3) because the implementing->governing exit gate (all-phase-checkpoints-current) is unmet — which is precisely what the per-phase run is trying to satisfy. Circular refusal. Workaround: pass --feature <slug> instead of --item (govern.ts:621 treats --feature as a first-class explicit slug and does NOT trigger the gate). But the govern --help text calls --item 'preferred over branch/marker', so an agent following the help hits the wall. Fix: make the compass precondition phase-aware — a --mode implement --phase run should gate at intent implementing (re-entry, allowed), not governing. Hit during 026 execute, Phase 1 govern.
<!-- SECTION:DESCRIPTION:END -->
