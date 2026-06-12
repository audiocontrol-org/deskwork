/**
 * plugins/stack-control/src/govern/convergence-types.ts
 *
 * specs/015-audit-protocol-convergence — Phase 2 (T005).
 *
 * The terminal result of one convergence-loop attempt over an `AuditUnit` (D4).
 * Discriminated union — every loop attempt ends in exactly one variant; the loop
 * NEVER returns control without one (data-model § ConvergenceOutcome invariant /
 * SC-004, deterministic termination).
 */

export interface ConvergedOutcome {
  readonly kind: 'converged';
  /** Rounds run before the gate returned OPEN. */
  readonly rounds: number;
}

export interface NonConvergedOutcome {
  readonly kind: 'non-converged';
  /** Rounds run (== ceiling at termination). */
  readonly rounds: number;
  /** The FR-014 per-checkpoint iteration ceiling that bounded the loop. */
  readonly ceiling: number;
}

/**
 * The terminal outcome of a convergence-loop run:
 *   - `converged`     — the gate returned OPEN; the unit may graduate.
 *   - `non-converged` — the ceiling was reached without OPEN (bounded
 *                       termination, FR-014); never an unbounded grind.
 *
 * There is no `overridden` driver terminal (AUDIT-20260612-05): an operator
 * `--override` is routed through the gate (it records the reason in the audit
 * trail and returns OPEN), so an overridden run graduates as `converged` with a
 * barrage record — the driver never needs a separate override short-circuit.
 */
export type ConvergenceOutcome = ConvergedOutcome | NonConvergedOutcome;
