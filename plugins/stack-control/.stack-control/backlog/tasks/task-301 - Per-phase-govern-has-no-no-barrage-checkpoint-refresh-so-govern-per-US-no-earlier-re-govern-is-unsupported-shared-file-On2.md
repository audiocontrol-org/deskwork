---
id: TASK-301
title: >-
  Per-phase govern has no no-barrage checkpoint refresh, so 'govern per US, no
  earlier re-govern' is unsupported (shared-file O(n2))
status: To Do
assignee: []
created_date: '2026-06-19 18:11'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 301000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Friction hit live during 028 front-door-completeness execution (2026-06-19). command-surface.ts is the deliberate single-source nearly every phase edits (P1 types -> P2 walker -> P3 mounts 46 families into MOUNTED -> P4 adds sub-actions), so each later phase stales ALL earlier per-phase checkpoints (the TASK-289 root). REPRO: govern --phase 2 hard-refused 'FATAL — phase 2 cannot advance until earlier required checkpoints are current: stale phase-1' (src/subcommands/govern.ts:446) — a fatal pre-check with no skip flag. WORKAROUND attempted: govern --phase 1 --override DID clear it but STILL fired the full 2-lane cross-model barrage (observed: 'fleet — configured 2, produced 2'). So there is NO cheap path to make an earlier checkpoint current. CONSEQUENCE: the operator's chosen approach (2026-06-19: 'govern per user-story, no earlier re-govern') is currently unsupported — to govern any later phase you must re-fire the barrage on every earlier shared-file phase, which IS the O(n2) spend the decision was meant to avoid. SUGGESTED-FIX: add a no-barrage checkpoint refresh (e.g. 'govern --refresh-checkpoint <phase>' that re-fingerprints the phase's files and writes a CURRENT checkpoint without a barrage when the phase's own logic is unchanged), OR exempt the staleness gate for additive shared-file overlap (diff-scoped fingerprint per TASK-289 so an earlier checkpoint only stales when the earlier phase's OWN hunks change). Relates-to: TASK-289 (staleness/O(n2) root), TASK-154 (audit-granularity switch), TASK-73 (per-phase backfill friction).
<!-- SECTION:DESCRIPTION:END -->
