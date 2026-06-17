// Composed convergence signal for the US1 per-phase graduate gate (025 T009).
//
// The whole-feature `record-converged impl` signal is DERIVED from the union of the
// per-phase checkpoints (FR-001a) — there is NO separate whole-feature govern run
// (that is the boundary-too-large path this feature removes). This module is a pure
// READ over the per-phase checkpoints, via the shared `resolvePhaseCheckpointStatuses`
// (the SAME currency logic govern writes under — no clone, and keyed by the SAME
// featureCheckpointKey). Fail-loud behaviour (FR-004): the ONLY fatal path is a phase
// that EXISTS but declares no authoritative file list (a zero-scope checkpoint would
// masquerade as governed). A tasks.md with ZERO `## Phase` headers is reported as a
// (named) UNMET verdict — NOT fatal — because the read-only compass evaluates this gate
// and must not crash on a non-phased/legacy feature (AUDIT codex-02/claude-01). This is
// deliberately distinct from `enumeratePhases` (the execute/govern primitive), which DOES
// throw on zero phases when an agent is actively governing. It assembles no payload and
// never spawns a barrage.

import { resolvePhaseCheckpointStatuses } from './phase-checkpoint-status.js';

/** One unmet phase in the per-phase gate, with WHY it is unmet (names the phase). */
export interface UnmetPhase {
  readonly phaseId: string;
  readonly reason: 'missing' | 'stale' | 'no-phases';
}

export interface PhaseCheckpointGateResult {
  /** Met iff there is ≥1 phase and every tasks.md phase has a current checkpoint. */
  readonly met: boolean;
  /** The phases without a current checkpoint, each naming the reason (SC-001/SC-002). */
  readonly unmet: readonly UnmetPhase[];
}

/**
 * Evaluate the per-phase checkpoint gate for a feature. Throws (FR-004) ONLY when a phase
 * EXISTS but has no authoritative file list (the masquerade danger) — via
 * `resolvePhaseCheckpointStatuses`. Zero derivable phases is a NAMED unmet verdict (not a
 * throw). Otherwise reports met/unmet, naming each offending phase. Pure read.
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
  // never satisfy a per-phase gate, so it is UNMET — named (claude-04), not silent — and
  // not a crash (the gate is also read by the read-only compass). The masquerade above is
  // the only fail-loud path.
  if (statuses.length === 0) {
    return { met: false, unmet: [{ phaseId: '(no tasks.md phases)', reason: 'no-phases' }] };
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
