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
 * There is no `overridden` driver terminal: specs/029 US4 (FR-017) short-circuits
 * an operator `--override` ENTIRELY before the driver runs (govern records the
 * attributable override graduation + the convergence record and returns, firing
 * zero render/barrage/lift/slush). So the driver only ever runs a real,
 * unoverridden convergence attempt and needs exactly two terminals — converged and
 * non-converged. (Pre-029 the override was routed through the gate as `converged`
 * with a barrage record; that pass is no longer fired.)
 */
export type ConvergenceOutcome = ConvergedOutcome | NonConvergedOutcome;
