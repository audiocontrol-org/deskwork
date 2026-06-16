# Backlog reconciliation — 022 parseable-lifecycle-workflow (T035)

Per the constitution's closure gate (`.claude/rules/agent-discipline.md` §
*Issue closure requires verification in a formally-installed release*), this file
**records dispositions and posts evidence**. It does **not** close any item — the
status transition is the operator's call after release verification. All three
items below remain `To Do` in the backlog.

## TASK-19 — Governance graduation has no on-disk record (DELIVERED by 022)

- **Disposition**: delivered as part of this feature's scope (ratified decision 3).
- **What landed**: the mode-keyed govern-convergence record mechanism
  (`src/govern/convergence-record.ts`), the `recordGovernConvergence` emit wired
  into `govern.ts` at the convergence/graduation point (keyed by the spec-dir
  basename, fail-safe on write error), and the mechanical `governing → shipped`
  gate that reads it (`src/workflow/phase-derivation.ts` +
  `src/workflow/gate-eval.ts`, `record-converged impl`).
- **Evidence**: `src/__tests__/workflow/govern-record.test.ts` — tasks-100%-but-
  no-record stays `governing`; a recorded ∧ converged impl record graduates to
  `shipped`; no agent assertion substitutes (SC-006).
- **Status**: stays `To Do` until verified in a formally-installed release.

## TASK-136 — Parseable, deterministic lifecycle workflow (THIS feature)

- **Disposition**: this is the feature. The seed (“document the workflow”) was
  sharpened to a parseable, deterministic engine that derives phase from existing
  artifacts, publishes every gate as a mechanical predicate in a governed
  `WORKFLOW.md`, and fires a fixed atomic effect manifest.
- **Evidence**: the full `src/workflow/` module + `src/__tests__/workflow/` suite
  (derivation, gates, query verbs, source-of-truth, effects, atomic advance,
  design gate, govern record, isolation, re-entry) — all green; the full plugin
  umbrella (244 files / 1617 tests) green.
- **Status**: stays `To Do` until verified in a formally-installed release.

## TASK-137 — `roadmap reparent` verb (PRECEDENT, not delivered here)

- **Disposition**: noted as the precedent for the *add-a-verb* rule (FR-020 / D7):
  “a missing effect means add a governed verb, never a prose effect.” The 022
  effect vocabulary is fixed and extends by adding a verb, exactly as `roadmap
  reparent` was added to the roadmap surface.
- **Not in 022 scope**: `roadmap reparent` itself is a separate roadmap-surface
  gap (`impl:gap/roadmap-reparent-verb`); this feature does not implement it.
- **Status**: unchanged.
