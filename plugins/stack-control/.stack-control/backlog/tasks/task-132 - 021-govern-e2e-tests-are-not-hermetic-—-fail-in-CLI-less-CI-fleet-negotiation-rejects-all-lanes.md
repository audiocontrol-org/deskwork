---
id: TASK-132
title: >-
  021 govern e2e tests are not hermetic — fail in CLI-less CI (fleet negotiation
  rejects all lanes)
status: To Do
assignee: []
created_date: '2026-06-15 17:37'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - 'PR #476 CI run 27563668688; plugins/stack-control/src/__tests__/govern*'
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-06-15 on PR #476: ~20 govern e2e tests fail in CI with 'fleet negotiation failed; accepted 0/2 viable lanes; Rejected: claude, codex, sonnet'. They PASS locally because the dev box has the claude CLI on PATH. The 021 fleet-negotiation gate fires before everything else and builds lane availability via a real which <binary> probe (binaryExistsOnPath in lane-capabilities.ts). govern exposes GOVERN_BARRAGE_BIN to stub the barrage but has NO env seam to stub the lane-availability probe, so e2e tests (which spawn govern as a subprocess) cannot make lanes viable without real model CLIs. Affected: govern-orchestration, govern-installation-anchor, govern-unresolvable-root, govern/phase-checkpoints, govern/govern-phase-unit, fleet-floor, convergence-driver. Fix candidate: add a test-only availability-stub env (e.g. GOVERN_FLEET_AVAILABLE) honored by the governed lane loader, mirroring GOVERN_BARRAGE_BIN; set it in the affected e2e tests. Related: TASK-116 (fixtures not hermetic). Blocks merge of #476.
<!-- SECTION:DESCRIPTION:END -->
