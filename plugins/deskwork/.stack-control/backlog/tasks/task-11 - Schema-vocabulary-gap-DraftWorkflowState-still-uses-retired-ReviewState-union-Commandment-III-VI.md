---
id: TASK-11
title: >-
  Schema vocabulary gap: DraftWorkflowState still uses retired ReviewState union
  (Commandment III/VI)
status: To Do
assignee: []
created_date: '2026-06-10 18:59'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-266
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/266

## Background

Step 2.3 of `studio-mobile-first` (commit `a1407e1`) committed a probe-fixture shortform workflow at `.deskwork/review-journal/pipeline/2026-05-13T14-38-40-890Z-58ec5639-...json`. The fixture state is `"in-review"` — a value drawn from the legacy `DraftWorkflowState` union (`'open' | 'in-review' | 'iterating' | 'approved' | 'applied' | 'cancelled'`).

Per `DESKWORK-STATE-MACHINE.md` Commandment III + VI, the `'in-review'` / `'iterating'` / `'approved'` `ReviewState` vocabulary is **retired**. The schema preserves it for back-compat reading of legacy sidecars but NEW data should not surface or perpetuate it.

The fixture's `"in-review"` value is therefore a **soft Commandment III divergence**.

## Why it shipped anyway

The probe needs an **active** shortform workflow to exercise the universal-bar Actions sheet verbs (Iter / Apprv / Canc). The schema's `DraftWorkflowState` union has no non-retired vocabulary for "active workflow" — the alternatives are:

- `'open'` — also legacy
- `'in-review'` — chosen; the most descriptive for an active workflow with content to review
- `'iterating'` / `'approved'` / `'applied'` — terminal-ish or post-retirement
- `'cancelled'` — terminal

So the schema effectively **forces** the implementer's hand: any active shortform fixture must use one of the retired values.

## What this issue tracks

The deskwork state machine's eight-stage pipeline (Ideas / Planned / Outlining / Drafting / Final / Published / Blocked / Cancelled) per `DESKWORK-STATE-MACHINE.md` is the canonical state space. Workflow records (the `.deskwork/review-journal/pipeline/*.json` shape) still use the **retired** `DraftWorkflowState` union.

The path forward, per Phase 0.2 of `studio-mobile-first` (Task 0.2 — audit + destroy reviewState violations), was to retire workflow-level `state` in favor of stage-based gating. The retirement has been partially done (Task 1.6 / 1.7) but **the workflow schema's `state: DraftWorkflowState` field is still load-bearing** — handlers, UI rendering, journal events, and now the probe fixture all use it.

This issue is about the schema vocabulary itself: **workflow.state needs a post-retired vocabulary OR a deprecation plan so new fixtures + new code can stop perpetuating the legacy union.**

## Scope of the work

1. **Audit `DraftWorkflowState` use in core/cli/studio.** Map every read-site and write-site. Distinguish:
   - Read sites: back-compat reading of legacy data (KEEP, per Commandment VI line 251 "`@deprecated — vestigial for sidecar back-compat only`").
   - Write sites: NEW code emitting these values (RETIRE or REPLACE).
2. **Design the replacement.** Options to evaluate:
   - **Option A**: drop `workflow.state` entirely; workflows derive their lifecycle from the parent entry's `currentStage`. (Aligns with Commandment I "the state is the stage.") Requires schema migration of existing journal records.
   - **Option B**: rename the union to a non-retired vocabulary that doesn't conflict with stage names. (e.g., `'active' | 'terminal'` as a coarse classification; or just `boolean isActive`.)
   - **Option C**: keep `state` but reduce the union to non-retired values (`'open' | 'cancelled'` only); migrate `in-review` / `iterating` / `approved` / `applied` to `'open'` on read; emit only `'open'` / `'cancelled'` on write.
3. **Migrate the existing fixtures** (7 pre-existing pipeline workflows under `.deskwork/review-journal/pipeline/`, 1 new probe fixture in `a1407e1`).
4. **Update tests + probes** that depend on the workflow `state` shape.
5. **Re-run `/deskwork:doctor`** post-migration to confirm no lingering Commandment III/VI surfaces.

## Why this is bigger than the probe fixture

The Step 2.3 probe-fixture is the **first agent-emitted** synthetic workflow with a retired state. Future fixtures, future seed data, future shortform tests will hit the same wall. Fixing the schema vocabulary lets us seed test data without compounding the Commandment III debt.

The probe fixture in `a1407e1` is defensible given the current constraints — but the constraints themselves are the bug.

## Acceptance criteria

- A design proposal for the `DraftWorkflowState` retirement is filed in `docs/` (PRD-shaped if it's a feature; ADR-shaped if it's a schema decision).
- After landing: every NEW workflow record (test fixture, agent-emitted, or operator-emitted) uses non-retired vocabulary.
- The schema's back-compat reader for legacy `DraftWorkflowState` is annotated `@deprecated — vestigial for sidecar back-compat only` per Commandment VI.
- No Commandment III/VI violation in `/deskwork:doctor`.

## References

- `DESKWORK-STATE-MACHINE.md` Commandment III (review state retired)
- `DESKWORK-STATE-MACHINE.md` Commandment VI (vestigial `ReviewState` — kill on sight where harmless)
- `docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/workplan.md` Task 0.2 (audit + destroy reviewState violations — partially complete via 1.6 / 1.7; this issue is the residual schema-vocabulary gap)
- Spec-compliance review of `a1407e1` (found the soft Commandment III divergence and recommended this issue)
- The fixture that surfaced this: `.deskwork/review-journal/pipeline/2026-05-13T14-38-40-890Z-58ec5639-0691-4a5d-a35e-30a627f74240.json`

## Out of scope

- Renaming any user-facing prose that historically referred to "review state" (already retired in 1.6 / 1.7).
- The fixture-pattern question (committed vs. per-run-seed-and-clean) is a separate concern; this issue is purely about the schema vocabulary that forces the fixture's hand.
<!-- SECTION:DESCRIPTION:END -->
