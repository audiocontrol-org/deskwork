# Contract: graduate-impl gate (single criterion)

The graduation criterion after the clean break: the `graduate-impl` gate evaluates **solely** on a converged whole-feature convergence record (FR-018). The either-of gate and the per-phase arm are removed.

## Before (deleted)

`gate-eval.ts:179–199` evaluated `graduate-impl` as an **either-of**:

```
allPhaseCheckpointsCurrent(ctx) || ctx.implRecordConverged
```

with `allPhaseCheckpointsCurrent` reading per-phase checkpoints (`gate-eval.ts:162–177`).

## After (single criterion)

`graduate-impl` collapses to the single whole-feature signal:

```
ctx.implRecordConverged
```

— true iff a **converged** `WholeFeatureConvergenceRecord` exists for the item (`isModeConverged('impl')`, `outcome='converged'`). No per-phase checkpoint is consulted.

## Deletions (FR-018, clean break)

- `all-phase-checkpoints-current` criterion + `allPhaseCheckpointsCurrent` + all callers — DELETED.
- The `||` either-of arm — COLLAPSED.
- `phase:shipped`'s `derive: record-converged impl` — re-evaluated against the single path; for the whole-feature record it is consistent (`implRecordConverged` true ⇒ derive true).

## Behavior

| Record state | Gate result |
|---|---|
| converged whole-feature record present (`outcome='converged'`) | **PASS** (US2 Scenario 2) |
| no converged record | refuse (graduation blocked) |
| `outcome` ∈ {`round-cap-surfaced`, `fix-failure-surfaced`, `unresolvable-merge-surfaced`} | refuse — the run STOPPED for operator decision; not auto-graduated (FR-013 / Principle V) |
| `outcome='override-eligible'` + operator `--override <reason>` | the 029 US4 attributable override graduation (separate path) |

## Invariants (testable)

- The gate passes on the whole-feature record alone, with no per-phase checkpoint on disk (US2 Scenario 2).
- `allPhaseCheckpointsCurrent` and the per-phase doctor rule are absent from the codebase (US2 Scenario 3 / SC-002 — per-phase-surface count = 0).
- A `*-surfaced` outcome never silently graduates (FR-013).
