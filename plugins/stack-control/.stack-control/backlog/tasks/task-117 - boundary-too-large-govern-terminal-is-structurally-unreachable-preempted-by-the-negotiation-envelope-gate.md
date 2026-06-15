---
id: TASK-117
title: >-
  boundary-too-large govern terminal is structurally unreachable: preempted by
  the negotiation envelope gate
status: Done
assignee: []
created_date: '2026-06-14 19:51'
updated_date: '2026-06-15 02:46'
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

## Resolution

<!-- SECTION:RESOLUTION:BEGIN -->
Fixed in `b709c845` via option **(b)** from the description: `negotiateFleet()`
no longer envelope-gates. It now selects lanes on the lane-health axis only
(availability / read-only enforcement / liveness / required-models floor); the
rendered-payload-vs-envelope check stays in `assertBoundaryFits()`. So a viable
fleet whose envelope is overflowed by the actual rendered payload now reaches the
distinct `boundary-too-large` terminal (US2/FR-006), while a fleet that cannot
meet the health floor is `negotiation-failed` (US3/FR-008) — the two stay
machine-distinguishable (SC-005). RED→GREEN e2e added in
`govern-terminal-outcomes.test.ts` (replaces the bug-documenting NOTE); the prior
`GOVERN_OVERRIDE` on the 021 phase-2 checkpoint no longer applies.
<!-- SECTION:RESOLUTION:END -->

