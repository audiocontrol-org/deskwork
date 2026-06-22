---
id: TASK-151
title: >-
  src/subcommands/govern.ts is 958 lines — past the 300-500 line cap (Principle
  VI); decompose into focused modules
status: Done
assignee: []
created_date: '2026-06-17 01:22'
updated_date: '2026-06-22 17:24'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed during 025 T028 file-size guard. 025's extraction into src/govern/phase-checkpoint-status.ts REDUCED govern.ts (~-80 lines) but it remains 958 lines — long-standing debt over the 300-500 cap. Candidate seams: arg/flag parsing, slug+root resolution, phase-unit + composition, checkpoint-write + convergence-record emit, fleet-negotiation preflight, terminal-outcome reporting. Sibling of TASK-48 (payload-implement.ts 577). Not refactored in 025 (out of scope); decompose under its own change with behavior-pinning tests first.
<!-- SECTION:DESCRIPTION:END -->
