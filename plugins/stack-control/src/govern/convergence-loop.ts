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
 */

import type { AuditUnit } from './audit-unit-types.js';
import type { ConvergenceOutcome } from './convergence-types.js';

export interface RunConvergenceLoopArgs {
  /** What is being audited (phase | feature) — carried for the per-attempt record. */
  readonly unit: AuditUnit;
  /** The FR-014 per-checkpoint iteration ceiling (default caller supplies 5). */
  readonly ceiling: number;
  /** One render→barrage→lift→slush→gate pass; resolves the gate's boolean. */
  readonly runPass: () => Promise<{ gateOpen: boolean }>;
  /** The agent's only in-loop action: fix the surfaced findings. */
  readonly dispatchFix: () => Promise<void>;
  /** A recorded operator override (mandatory reason); short-circuits to overridden. */
  readonly override?: { readonly reason: string };
}

/**
 * Run the convergence loop over one `AuditUnit` and resolve to exactly one
 * `ConvergenceOutcome`. The function ALWAYS resolves to a terminal variant — it
 * never returns control without one (SC-004). A `runPass` rejection propagates as
 * a loud failure rather than a silent stop (an OUTAGE is not convergence).
 */
export async function runConvergenceLoop(
  args: RunConvergenceLoopArgs,
): Promise<ConvergenceOutcome> {
  // A recorded override short-circuits before any pass (graduate-with-reason).
  if (args.override !== undefined) {
    return { kind: 'overridden', rounds: 0, reason: args.override.reason };
  }

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
