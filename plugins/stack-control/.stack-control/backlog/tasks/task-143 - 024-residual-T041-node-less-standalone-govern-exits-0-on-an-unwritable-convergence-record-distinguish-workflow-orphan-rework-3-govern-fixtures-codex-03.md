---
id: TASK-143
title: >-
  024 residual (T041): node-less standalone govern exits 0 on an unwritable
  convergence record; distinguish workflow-orphan + rework 3 govern fixtures
  (codex-03)
status: To Do
assignee: []
created_date: '2026-06-16 15:28'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed STILL-VALID 2026-06-22 (uncertainty removed). writeGovernConvergenceRecord (convergence-record.ts:55-67) does atomic mkdir+temp-write+rename with no try/catch, so it WOULD throw on an unwritable dir — but in a node-less standalone govern (spec mode), the write is never reached: govern-arms.ts runSpecArm:441-449 catches the resolveConvergenceItem throw (no roadmap node → no key), WARNs, leaves convergenceItem undefined; line 450 guards the write behind `if (convergenceItem !== undefined)`, so the write is SKIPPED and the run exits 0 (line 482). An unwritable convergence dir is therefore never discovered in the node-less path. Implement mode correctly exits 2 FATAL in the same situation (govern-arms.ts:239-240); spec mode does not. The T041 caveat comment at govern-arms.ts:435-438 documents the deferral. Existing test override-short-circuit.test.ts:216-246 covers unwritable-dir on the OVERRIDE path (exits 1) but NOT node-less + unwritable. Fix options: attempt the write even node-less (so an unwritable dir is caught), OR check writeability upfront and fail loud, OR change the node-less exit from 0 to non-zero. Swallow point: govern-arms.ts:450.
<!-- SECTION:DESCRIPTION:END -->
