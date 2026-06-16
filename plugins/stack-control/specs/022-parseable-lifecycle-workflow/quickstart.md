# Quickstart: Parseable lifecycle workflow engine

Validation scenarios proving the feature works end-to-end. Each maps to a success criterion in `spec.md`. Run from a stack-control installation (the monorepo dogfood: `plugins/stack-control`).

## Prerequisites

- A stack-control installation (a dir owning `.stack-control/config.yaml`) with a roadmap (`ROADMAP.md`) and the bundled `WORKFLOW.md` default resolvable.
- Vitest available (`npm --workspace @deskwork/... test` or the plugin's test umbrella).

## Scenario 1 — Query the gates without advancing (SC-001, SC-002, US1/US2)

```bash
stackctl workflow status <item>          # current phase + exit criteria met/unmet (M of N)
stackctl workflow can-enter <item> <stage>   # entrance criteria + what's missing
stackctl workflow status <item>          # re-run: byte-identical output, zero writes
```

Expected: exactly one derived phase; unmet criteria enumerated; the second run produces identical output and writes nothing.

## Scenario 2 — Governed WORKFLOW.md is the source of truth (US3)

Edit a criterion in the resolved `WORKFLOW.md` (or an installation override) and re-run `workflow status` — the answer changes, proving the doc (not code) governs. A malformed `WORKFLOW.md` makes the engine fail loud naming the grammar violation (no silent default).

## Scenario 3 — Atomic advance with rollback (SC-004, US4)

```bash
stackctl workflow advance <item>         # dry-run: previews the ordered effects, writes nothing
stackctl workflow advance <item> --apply # applies bookkeeping effects, commit fires LAST
```

Expected: on success, all effects captured by a single trailing commit. With a fault injected before the commit, the advance-touched paths are restored and nothing is committed. On a dirty advance-touched tree, `--apply` refuses loud.

## Scenario 4 — The designing phase + frontend over backend (SC-007, US5)

```bash
/stack-control:design <item>             # sets design: pointer on entry; drives the backend in-session
```

Expected: the `design:` pointer is set immediately (derivation reports `designing`); the design record is written at `<install-root>/docs/superpowers/specs/...` with all required sections; the `design-to-spec` exit gate fails loud when a required section is missing, when fewer than 2 solution-space alternatives are present, or when the `design-approved:` node marker is absent.

## Scenario 5 — Governance recorded on disk makes the back half mechanical (SC-006, US6)

Run governance to convergence; confirm a mode-keyed record is written inside the installation. The `governing → shipped` exit gate passes only when the `impl` record is recorded ∧ converged; an item with `tasks.md` 100% but no record reports the gate unmet.

## Scenario 6 — Adopter-repo isolation (SC-005, US7)

Run the full workflow surface in an installation nested below an adopter repo root; the isolation probe asserts no authored artifact (WORKFLOW.md override, design record, govern-convergence record, effect bookkeeping) resolves outside the installation tree.

## Test entry points

- `src/__tests__/workflow/phase-derivation.test.ts` — Scenario 1/2 derivation totality + determinism.
- `src/__tests__/workflow/gate-eval.test.ts` — criterion true/false + unmet enumeration.
- `src/__tests__/workflow/advance-atomic.test.ts` — Scenario 3 fault-injection at each effect position.
- `src/__tests__/workflow/design-gate.test.ts` — Scenario 4 exit-gate failures.
- `src/__tests__/workflow/govern-record.test.ts` — Scenario 5 mode-keyed record reads.
- `src/__tests__/workflow/installation-isolation-022.test.ts` — Scenario 6 (mirrors the existing isolation probe).
