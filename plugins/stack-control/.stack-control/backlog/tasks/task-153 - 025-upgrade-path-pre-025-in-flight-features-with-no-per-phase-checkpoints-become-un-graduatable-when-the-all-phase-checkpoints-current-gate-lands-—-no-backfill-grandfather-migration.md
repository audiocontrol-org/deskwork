---
id: TASK-153
title: >-
  025 upgrade path: pre-025 / in-flight features with no per-phase checkpoints
  become un-graduatable when the all-phase-checkpoints-current gate lands — no
  backfill / grandfather / migration
status: To Do
assignee: []
created_date: '2026-06-17 01:48'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AUDIT-BARRAGE claude-02 (HIGH), 025 phase-1 re-govern 2026-06-17. evaluatePhaseCheckpoints returns met:false for a tasks.md with zero ## Phase headers OR with no per-phase checkpoints; the graduate + start-governing gates consume that as a hard block. New features authored under 025 are fine, but a feature already mid-implementing on upgrade (non-phased tasks.md, or governed via the old whole-feature record-converged impl run) silently loses the ability to graduate, with nothing telling the operator a one-time backfill is needed. Spec never addressed fresh-install-vs-upgrade. Candidate fixes (operator scope): (a) a grandfather predicate honoring a legacy whole-feature converged record when no ## Phase headers exist; (b) a doctor rule / backfill verb that re-runs govern --phase across existing phases; (c) document the required upgrade step. Decide whether in-scope for 025 or a follow-on.
<!-- SECTION:DESCRIPTION:END -->
