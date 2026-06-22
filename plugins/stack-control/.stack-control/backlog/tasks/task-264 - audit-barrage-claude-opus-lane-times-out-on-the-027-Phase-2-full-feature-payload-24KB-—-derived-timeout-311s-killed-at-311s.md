---
id: TASK-264
title: >-
  audit-barrage claude/opus lane times out on the 027 Phase 2 full-feature
  payload (24KB) — derived timeout 311s, killed at 311s
status: Done
assignee: []
created_date: '2026-06-19 00:24'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 264000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 2 full-diff-base govern: claude (opus, timeout_secs_per_kb=13, floor=300) derives a 311s timeout for a 24454-byte payload and is KILLED at exactly 311s while still running — so claude never completes a full-mount audit and the run is DEGRADED (codex-only). codex (gpt-5.5, secs_per_kb=7) completes the same payload in 82s. The cross-model agreement signal is unavailable for any phase whose payload pushes claude past its derived budget. Fix options (operator-owned config .stack-control/audit-barrage-config.yaml): raise claude timeout_secs_per_kb (13->~20) or the floor; or right-size per-phase payloads. TASK-145 class (audit-barrage liveness/timeout).
<!-- SECTION:DESCRIPTION:END -->
