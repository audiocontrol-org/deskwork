---
id: TASK-120
title: >-
  US1 whole-feature govern: strict checkpoint gate contradicts the
  compose-from-checkpoints contract (resolveComposingFeatureUnit unreachable at
  CLI)
status: Done
assignee: []
created_date: '2026-06-14 20:24'
updated_date: '2026-06-22 16:11'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-3 audit, codex-gpt5 HIGH (AUDIT-BARRAGE-codex-01). govern.ts:685 assertWholeFeatureCheckpointsCurrent FATALs if ANY phase checkpoint is missing/stale; line 686-694 then maps changed=state!=current into resolveComposingFeatureUnit. Because the gate already required all-current, the 'changed/missing → re-audit' branch is dead at the CLI: the composition function (and its T010 test) describe selective carry/re-audit behavior the command never delivers. Spec contradiction: US1 says 'whole-feature composes from checkpoints instead of erasing them' (selective) AND its independent test says 'missing/stale checkpoints block whole-feature substitution' (strict gate). DESIGN FORK for operator: (a) strict-gate-then-full-safety-net (current; composition is vestigial), or (b) true composition (relax the gate; re-audit stale/missing, carry current). Affects whether the after_implement pass actually burns down the per-phase redundancy the feature promises.
<!-- SECTION:DESCRIPTION:END -->
