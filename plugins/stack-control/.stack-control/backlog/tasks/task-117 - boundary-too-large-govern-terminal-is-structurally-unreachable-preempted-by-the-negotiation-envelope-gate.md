---
id: TASK-117
title: >-
  boundary-too-large govern terminal is structurally unreachable: preempted by
  the negotiation envelope gate
status: To Do
assignee: []
created_date: '2026-06-14 19:51'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
specs/021 US2/T015 + US5/T028. negotiateFleet() rejects any lane whose envelope.maxPromptBytes < renderedPromptBytes (disposition negotiation-failed), and assertBoundaryFits() in protocol.ts checks renderedPromptBytes against activeEnvelope = min(ACCEPTED lanes' envelopes). Because every accepted lane already has envelope >= renderedPromptBytes, activeEnvelope >= renderedPromptBytes always holds, so assertBoundaryFits never throws BoundaryTooLargeError after a successful negotiation. The boundary-too-large terminal (and the spec's US2 'prospectively-safe but actually-oversized phase fails with boundary-too-large') is therefore preempted by negotiation-failed and cannot be reached through govern. Decide: (a) drop the redundant boundary check + fold its messaging into negotiation, or (b) make negotiation NOT envelope-gate (let boundary-too-large own actual-size rejection so prospective-vs-actual divergence is distinguishable). Found during 021 T027 burndown.
<!-- SECTION:DESCRIPTION:END -->
