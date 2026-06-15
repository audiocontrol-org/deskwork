---
id: TASK-124
title: >-
  phase-checkpoints composition test only asserts the gate didn't fire; does not
  positively verify composition (carried excluded / non-carried re-audited)
status: To Do
assignee: []
created_date: '2026-06-15 00:32'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
021 phase-3 audit, codex MEDIUM / codex-gpt5 LOW. The 'whole-feature govern composes instead of gating' test in phase-checkpoints.test.ts asserts NOT exit-2 and NOT the strict-gate message, but does not positively prove the composition contract: that a CURRENT phase's files are excluded from the payload while a missing/stale phase's files (and cross-cutting code) are re-audited. Strengthen: capture the rendered prompt/vars (like govern-installation-anchor canaries) and assert a carried-phase canary is absent while a non-carried canary is present.
<!-- SECTION:DESCRIPTION:END -->
