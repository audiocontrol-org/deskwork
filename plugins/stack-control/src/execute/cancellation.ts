// specs/036-fleet-control-plane — T072 (impl), pairs with the RED test at
// ../../tests/fleet/cooperative-cancel.test.ts.
//
// PT-011 / data-model.md § `cancel` semantics (~line 114-116):
//   "Cooperative, task-boundary scoped. Sets a flag the run observes at its
//    next task boundary; does not interrupt mid-task. Ends the run, not the
//    invocation. Child processes are not force-terminated — that is the
//    future `terminate` verb's job, named precisely to keep cooperative
//    `cancel` unambiguous. Does not time out: a run that never reaches a
//    boundary stays `cancelling` visibly, which is honest rather than
//    silently escalating to a kill."
//
// SCOPE (per the task): `src/execute/` is the execute-skill's support
// machinery (tier-resolution, ledger, task-parser) — not a live run loop.
// This module delivers the cooperative-cancel PRIMITIVE only: a
// self-contained, tested state machine a task loop can hold onto and check
// at each boundary. Wiring it into an actual run-execution loop is a later
// concern — not built here.
//
// The primitive's `status` values are deliberately the subset of
// `ExecutionStatus` (src/fleet/status.ts) that a cooperative cancel actually
// passes through — 'running' → 'cancelling' → 'cancelled' — so a caller
// that threads this into the fleet execution-status axis has no value to
// translate. No timer anywhere in this file: `status` only ever advances in
// response to an explicit `requestCancel()` / `markStoppedAtBoundary()`
// call, never on its own, matching the "does not time out" promise above.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 module resolution (no `@/` alias configured in
// this plugin). No fallbacks — an illegal transition throws a descriptive
// error rather than silently no-op'ing into the wrong state.

/**
 * The cooperative-cancel primitive's lifecycle. Mirrors the subset of
 * `ExecutionStatus` (src/fleet/status.ts) a cancel actually visits:
 *
 *   running ──requestCancel()──► cancelling ──markStoppedAtBoundary()──► cancelled
 *
 * `cancelling` is a STABLE, visible waiting state — nothing in this module
 * advances it to `cancelled` except the run loop itself calling
 * `markStoppedAtBoundary()` once it has actually stopped at a boundary. A
 * run that never reaches a boundary stays `cancelling` forever; that is the
 * honest behavior PT-011 requires, not a bug to "fix" with a timer.
 */
export type CooperativeCancelStatus = 'running' | 'cancelling' | 'cancelled';

/**
 * A cooperative, task-boundary-scoped cancellation token for a single run.
 * The run loop holds one of these and, at each task boundary, calls
 * `shouldStopAtBoundary()`; if it returns true the loop ends the run and
 * reports the stop via `markStoppedAtBoundary()`. Mid-task, the token is
 * inert — nothing here can interrupt work already in flight, per PT-011.
 */
export interface RunCancellation {
  /**
   * Request cancellation. Moves `running` → `cancelling`. Idempotent: a
   * second (or later) call while already `cancelling` or `cancelled` is a
   * no-op — it never throws, never queues a second cancel, and never moves
   * `cancelled` back to `cancelling` (no resurrection of a terminal state).
   */
  requestCancel(): void;

  /**
   * True once a cancel has been requested (`cancelling` or `cancelled`),
   * false while still `running`. The run loop calls this AT a task
   * boundary — never mid-task — to decide whether to end the run.
   */
  shouldStopAtBoundary(): boolean;

  /** The current lifecycle status. Never advances except via the two methods above. */
  readonly status: CooperativeCancelStatus;

  /**
   * Record that the run loop observed the cancel request at a task boundary
   * and has stopped the run. Moves `cancelling` → `cancelled` (terminal).
   * Throws if called without a preceding `requestCancel()` (illegal
   * transition from `running`) or after the run is already `cancelled`
   * (terminal — no re-stopping an already-stopped run).
   */
  markStoppedAtBoundary(): void;
}

/** Create a fresh cooperative-cancel token in the `running` state. */
export function createRunCancellation(): RunCancellation {
  let status: CooperativeCancelStatus = 'running';

  return {
    requestCancel(): void {
      // Idempotent per PT-011's two-cancels-dedup rule: only the
      // running → cancelling edge does anything; cancelling and cancelled
      // are both left exactly as they are.
      if (status === 'running') {
        status = 'cancelling';
      }
    },

    shouldStopAtBoundary(): boolean {
      return status === 'cancelling' || status === 'cancelled';
    },

    get status(): CooperativeCancelStatus {
      return status;
    },

    markStoppedAtBoundary(): void {
      if (status === 'running') {
        throw new Error(
          'markStoppedAtBoundary: illegal transition — no cancel has been requested ' +
            "(status is 'running'). Call requestCancel() first.",
        );
      }
      if (status === 'cancelled') {
        throw new Error(
          "markStoppedAtBoundary: illegal transition — status is already 'cancelled' " +
            '(terminal); a run cannot be stopped twice.',
        );
      }
      status = 'cancelled';
    },
  };
}
