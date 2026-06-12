---
id: TASK-27
title: >-
  spec-governance gate: cluster-max severity inflation can make
  two-consecutive-0-HIGH structurally unreachable
status: To Do
assignee: []
created_date: '2026-06-11 13:16'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed on the 014 audit-barrage-reliability govern loop (rounds 4-7, 2026-06-11): each round surfaced exactly one new finding rated HIGH via the lift's max-of-cluster severity, while the finding's own prose self-assessed low/latent blast radius (AUDIT-19: 'currently unreachable', AUDIT-21: 'genuinely low'). Because every fix round audits its own fix-code, consistency-seam findings keep arriving and the dampener's two-consecutive-raw-0-HIGH branch never engages — the loop plateaus at 1-HIGH-per-round with no convergence path except operator override. Candidate directions (scope later): severity calibration in the lift (use the cluster's own blast-radius language, not max label), a per-round marginal-severity trend signal in the gate reason, or a code-audit analog of the spec-audit diminishing-returns rule.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Addressed by spec 015-audit-protocol-convergence (US1 / FR-001). The lift's
max-of-cluster severity is replaced with cross-lane severity AGREEMENT
(`cluster-severity.ts:computeClusterSeverity`) plus an adjudication re-score for
residual single-lane inflations (`adjudicate-findings.ts`): a cluster one lane
rated HIGH and another rated MEDIUM now gate-counts MEDIUM, so the dampener's
two-consecutive-raw-0-HIGH branch becomes reachable (proven by
`__tests__/govern/convergence-sc001.test.ts`, SC-001). A genuine >=2-lane HIGH
still blocks (SC-003). Status left To Do pending verification in a formally
installed release (per the issue-closure discipline — the operator closes).
<!-- SECTION:NOTES:END -->
