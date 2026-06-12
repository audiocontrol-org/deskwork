# Quickstart: validating Audit-protocol convergence correctness + incremental audit units

Runnable validation scenarios proving the feature works end-to-end. Each maps to a Success Criterion. Run from `plugins/stack-control`. Tests: `npm --workspace @deskwork/plugin-stack-control test`.

## Prerequisites

- 014 reliability primitives in place (model pinning, derived timeout, plan-mode enforcement, terminal states, watchdog).
- Fixture audit-logs and run-dirs under tmp (never mocked fs).
- The 014 hostile-write-probe harness available (reused for SC-007).

## SC-001 — convergence reaches a clean stop (threads 1/2)

1. Build a fixture finding stream replaying 014 rounds 4–7: each round one cluster `perLane = [{opus, high}, {codex, medium}]`.
2. Run the lift's severity computation → each cluster gate-counted `medium` (D1).
3. Drive `runConvergenceLoop` with a `runPass` backed by that stream.
4. **Expected**: the two-consecutive-raw-0-HIGH branch engages; outcome `converged`; zero overrides. (Contrast: with max-of-cluster, each round is gate-counted `high` and the loop never converges.)

## SC-002 — every de-inflated cluster is auditable

1. Lift a run with mixed-severity clusters.
2. **Expected**: each finding's audit-log entry records `perLaneSeverities` + the `rule` (+ `adjudicationBasis` when adjudicated); the gate-counted `Severity:` line equals the decision's `gateCountedSeverity`.

## SC-003 — real HIGHs are not suppressed

1. Cluster `perLane = [{opus, high}, {codex, high}]`; and a single-model `[{opus, high}]`.
2. **Expected**: both gate-counted `high`; the gate stays BLOCKED until fixed or overridden. De-inflation suppresses zero real HIGHs.

## SC-004 — loop termination is code-owned

1. Drive `runConvergenceLoop` with a stub gate: (a) OPEN on pass 1; (b) always BLOCKED, ceiling 5; (c) BLOCKED×2 then OPEN.
2. **Expected**: (a) `converged, rounds 1`, no `dispatchFix`; (b) `non-converged, rounds 5`, `dispatchFix` ×4; (c) `converged, rounds 3`, `dispatchFix` ×2. No agent branch involved; deterministic terminal in every case.

## SC-005 — payload excludes own audit-log + parked scaffolds

1. Render the implement payload for a feature with a populated audit-log and an unrelated untracked parked scaffold.
2. **Expected**: zero bytes of the audit-log content in the payload; the parked scaffold excluded; an in-scope untracked file still folded.

## SC-006 — per-phase unit shrinks the payload

1. `resolvePhaseUnit` for one completed phase of a multi-phase fixture tasks.md.
2. **Expected**: `diffScope` contains only that phase's files; the rendered per-phase payload is smaller than the whole-feature payload; its derived timeout for the slowest admitted lane is under the timeout with margin; the same loop/protocol governs it.

## SC-007 — sonnet cannot mutate under enforcement; decision recorded

1. Spawn sonnet on a representative per-phase payload under `--permission-mode plan` with the 014 hostile-write-probe (create file / redirect / python-write / commit+push).
2. **Expected**: zero new files, zero commits, zero pushes; latency + finding-depth recorded against the FR-011 bar; the admit/reject decision + evidence recorded (override-profile lane).

## SC-008 — Facet-A raw-counting regression guard

1. Feed the dampener an audit-log where a run raw-surfaced ≥1 MEDIUM later flipped to `acknowledged-slush-pile`, and a run with a HIGH later marked `fixed-<sha>`.
2. **Expected**: branch (a) does NOT engage on the slushed-MED run (raw count non-zero); the fixed-HIGH run does NOT count as 0-HIGH for branch (b).
3. **Mutation check**: revert the raw count to open-count → the test goes RED.
