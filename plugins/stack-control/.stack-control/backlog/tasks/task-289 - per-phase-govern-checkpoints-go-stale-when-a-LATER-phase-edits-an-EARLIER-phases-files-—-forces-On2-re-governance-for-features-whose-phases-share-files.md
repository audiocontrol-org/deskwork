---
id: TASK-289
title: >-
  per-phase govern checkpoints go stale when a LATER phase edits an EARLIER
  phase's files — forces O(n^2) re-governance for features whose phases share
  files
status: To Do
assignee: []
created_date: '2026-06-19 02:44'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 289000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
027 Phase 4 govern fataled: 'phase 4 cannot advance until earlier checkpoints are current: stale phase-2, stale phase-3'. Cause: phases 2 (commander mount), 3 (help), 4 (cluster) all edit roadmap.ts/roadmap-command.ts/roadmap-help.ts; the per-phase checkpoint fingerprints whole-file content, so phase-4's edits staleness-invalidate the phase-2/3 checkpoints. The all-earlier-checkpoints-current gate (FR-007) then blocks phase-4. With per-phase-as-you-go governance this is O(n^2): each new phase re-stales all earlier shared-file checkpoints, so phase N requires re-governing 1..N-1. The structural fix: for a feature whose phases share files, implement all phases, THEN govern each phase IN ORDER against the final stable tree (O(n) — each checkpoint stays current because the tree no longer changes). Consider: (a) fingerprint only the phase's OWN hunks not whole files; (b) a govern ordering/mode that tolerates a later-phase edit to an earlier file; (c) document govern-at-end for shared-file features. Related: TASK-87/97/160 (checkpoint fingerprint stability).
<!-- SECTION:DESCRIPTION:END -->
