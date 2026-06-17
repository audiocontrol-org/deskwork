---
id: TASK-154
title: >-
  Audit-granularity switch: re-admit full-audit-at-end as a graduate path (gate
  honors per-phase checkpoints OR a whole-feature record-converged impl); make
  per-phase opt-in, not mandatory
status: To Do
assignee: []
created_date: '2026-06-17 02:32'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Operator design reconsideration 2026-06-17, after dogfooding 025. 025's US1 swapped the graduate gate from record-converged impl to all-phase-checkpoints-current, which reads ONLY per-phase checkpoints and ignores a whole-feature convergence record — so a full audit at the end no longer satisfies the gate; per-phase is mandatory to graduate. The 025 clarify deliberately chose 'compose' and REJECTED the 'augment' (per-phase OR whole-feature) option; this item revisits that decision.

WHY (operator observations, confirmed live in the 025 dogfood):
- Per-phase was intended to SIZE the audit payload for older/smaller models. It did not pay off: (a) per-phase scoping creates blind spots — the barrage cannot see fixes in files outside the current phase's scope (the claude-01 false-positive in the 025 phase-1 re-govern: govern.ts write-side fix was invisible because it lived in another phase's scope); (b) a phase's research.md/anchors reference files in OTHER phases, which the models read anyway, so the referenced surface is not actually smaller.
- It MAGNIFIED the ringing/oscillation (auditors getting ever nit-pickier). Per-phase multiplies auditing rather than reducing it: 8 phases x N oscillating rounds ~= 8x the nit-picking surface and 8x the chance a fresh model finds a fresh nit, vs ONE convergence loop at the end. This is the TASK-60 myopic-convergence pathology amplified.

PROPOSED SHAPE (for /stack-control:design): a per-installation/per-feature audit-granularity choice where the graduate gate is met by EITHER all-phase-checkpoints-current OR a whole-feature record-converged impl (the 'augment'/either-of option). Default to full-audit-at-end (one convergence loop); per-phase becomes OPT-IN for small-model fleets that genuinely need payload-sizing. Touches: templates/WORKFLOW.md gate semantics (graduate + start-governing), the govern default mode, the 025 spec clarify record (must amend the rejected-augment decision), and the convergence-record reader. Related: TASK-60 (myopic convergence), .claude/rules/spec-audit-diminishing-returns.md. Operator chose: capture-to-backlog (decide scheduling later); the thorough path is /stack-control:design.
<!-- SECTION:DESCRIPTION:END -->
