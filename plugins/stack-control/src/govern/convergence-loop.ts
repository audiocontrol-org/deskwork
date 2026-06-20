/**
 * plugins/stack-control/src/govern/convergence-loop.ts
 *
 * specs/015-audit-protocol-convergence — Phase 4 / US2 (T017).
 *
 * The code loop driver (FR-004/005 / D4). Lifts the multi-round convergence loop
 * out of skill-body prose into code that owns the iterate/stop decision and the
 * FR-014 iteration ceiling. The gate (`spec-governance-gate.ts`) is UNCHANGED —
 * it still emits exactly one OPEN/BLOCKED boolean (#432). The driver CONSUMES
 * that boolean and never re-derives policy.
 *
 * The thesis directive is *make failure states mechanically impossible*: a loop
 * whose controller is the same agent that fixes findings is structurally unable
 * to be unattended. This driver removes the agent's discretion over re-run/stop
 * (SC-004) and is deterministic in every branch (FR-005). The agent's only
 * in-loop action is `dispatchFix` — the sole mutation seam; the driver never
 * auto-edits the work under audit. The state machine is in
 * data-model.md § "State Machine: convergence loop driver".
 *
 * An operator `--override` is NOT a driver concern: specs/029 US4 (FR-017) makes
 * govern short-circuit the override ENTIRELY before the driver runs — it records
 * the attributable override graduation + the convergence record and returns,
 * firing zero render/barrage/lift/slush. So the driver only ever sequences a real,
 * unoverridden convergence attempt; it has exactly two terminals — converged and
 * non-converged — and does not carry the audit unit (findings are recorded by the
 * lift, not the loop; the driver only sequences passes).
 */

import type { ConvergenceOutcome } from './convergence-types.js';

export interface RunConvergenceLoopArgs {
  /**
   * The iteration ceiling the caller supplies. FR-014's per-checkpoint
   * convergence ceiling is 5 (the target for an autonomous in-process loop), but
   * the current sole caller — `govern` — passes 1, because it applies NO
   * in-process fix between rounds (govern.ts:resolveCeiling), so a higher ceiling
   * would only re-barrage an unchanged tree. The driver bounds the loop at
   * whatever it is handed; it does not pick the value.
   */
  readonly ceiling: number;
  /** One render→barrage→lift→slush→gate pass; resolves the gate's boolean. */
  readonly runPass: () => Promise<{ gateOpen: boolean }>;
  /** The agent's only in-loop action: fix the surfaced findings. */
  readonly dispatchFix: () => Promise<void>;
}

/**
 * Run the convergence loop and resolve to exactly one `ConvergenceOutcome`. The
 * function ALWAYS resolves to a terminal variant — it never returns control
 * without one (SC-004). A `runPass` rejection propagates as a loud failure rather
 * than a silent stop (an OUTAGE is not convergence).
 */
export async function runConvergenceLoop(
  args: RunConvergenceLoopArgs,
): Promise<ConvergenceOutcome> {
  let rounds = 0;
  // The ceiling bounds the loop (FR-014); below it, a BLOCKED gate dispatches a
  // fix and re-runs. The iterate/stop transition is the driver's, never the
  // agent's.
  for (;;) {
    rounds += 1;
    const { gateOpen } = await args.runPass();
    if (gateOpen) {
      return { kind: 'converged', rounds };
    }
    if (rounds >= args.ceiling) {
      return { kind: 'non-converged', rounds, ceiling: args.ceiling };
    }
    await args.dispatchFix();
  }
}
