// Composed convergence signal for the US1 per-phase graduate gate (025 T009).
//
// The whole-feature `record-converged impl` signal is DERIVED from the union of the
// per-phase checkpoints (FR-001a) — there is NO separate whole-feature govern run
// (that is the boundary-too-large path this feature removes). This module is a pure
// READ over the per-phase checkpoints: it enumerates the tasks.md phases (failing
// loud per FR-004 on zero phases / a phase with no authoritative file list), resolves
// each phase's checkpoint currency via the shared `resolvePhaseCheckpointStatuses`
// (the SAME logic govern uses to write them — no clone), and reports the gate verdict.
// It assembles no payload and never spawns a barrage.

import { resolvePhaseCheckpointStatuses } from './phase-checkpoint-status.js';

/** One unmet phase in the per-phase gate, with WHY it is unmet (names the phase). */
export interface UnmetPhase {
  readonly phaseId: string;
  readonly reason: 'missing' | 'stale';
}

export interface PhaseCheckpointGateResult {
  /** Met iff every tasks.md phase has a current checkpoint. */
  readonly met: boolean;
  /** The phases without a current checkpoint, each naming the reason (SC-001/SC-002). */
  readonly unmet: readonly UnmetPhase[];
}

/**
 * Evaluate the per-phase checkpoint gate for a feature. Fails loud (FR-004) on a
 * malformed phase set (zero derivable phases, or a phase with no authoritative file
 * list) via `enumeratePhases`; otherwise reports met/unmet with the offending phases.
 */
export function evaluatePhaseCheckpoints(
  installationRoot: string,
  slug: string,
  tasksPath: string,
): PhaseCheckpointGateResult {
  // resolvePhaseCheckpointStatuses FAILS LOUD (FR-004) on the dangerous case — a phase
  // that EXISTS but declares no authoritative file list — because a zero-scope checkpoint
  // would masquerade as governed (US1 acceptance #4). That throw propagates to the caller.
  const statuses = resolvePhaseCheckpointStatuses(installationRoot, slug, tasksPath);
  // Zero derivable phases is NOT trivially met: a tasks.md with no `## Phase` headers can
  // never satisfy a per-phase gate, so it is UNMET (not a crash — the gate is also read
  // by the read-only compass). The dangerous masquerade above is the only fail-loud path.
  if (statuses.length === 0) {
    return { met: false, unmet: [] };
  }
  const unmet: UnmetPhase[] = [];
  for (const status of statuses) {
    if (status.state === 'missing' || status.state === 'stale') {
      unmet.push({ phaseId: status.phaseId, reason: status.state });
    }
  }
  return { met: unmet.length === 0, unmet };
}

/**
 * The composed `record-converged impl` signal (FR-001a): converged IFF every
 * tasks.md phase has a current checkpoint. A pure derivation from the checkpoint
 * union — no whole-feature govern run, no payload assembled.
 */
export function composeConvergedImpl(
  installationRoot: string,
  slug: string,
  tasksPath: string,
): boolean {
  return evaluatePhaseCheckpoints(installationRoot, slug, tasksPath).met;
}
