// Shared types + the fail-loud error for the govern audit-protocol. Extracted from
// protocol.ts (030 T086) so protocol.ts and its helper modules (e.g. fleet-status) can
// share them without a circular import. protocol.ts re-exports these as its public API.

/**
 * Machine-distinguishable terminal outcomes (specs/021 US5 / T028). Every govern
 * EXECUTION exit emits exactly one `govern: terminal-outcome=<kind>` line so a consumer
 * can tell the degraded states apart without fragile message-substring matching: a fleet
 * that could not be negotiated, a barrage that produced no covering family (outage), and a
 * barrage that produced coverage but missed the cross-model floor are different failures
 * with different recoveries. `negotiation-failed` (lane-health floor) and
 * `fleet-floor-shortfall` (covering families produced) stay machine-distinguishable
 * (SC-005). The `--help` early return is NOT a governed run and emits no terminal-outcome.
 */
export type GovernTerminalKind =
  | 'graduated'
  | 'blocked'
  | 'negotiation-failed'
  | 'fleet-floor-shortfall'
  | 'barrage-outage'
  | 'payload-error'
  | 'usage'
  | 'fatal';

/** Thrown for any fail-loud protocol condition; carries a process exit code + terminal. */
export class GovernProtocolError extends Error {
  readonly exitCode: number;
  readonly terminalKind: GovernTerminalKind;
  constructor(message: string, exitCode = 2, terminalKind: GovernTerminalKind = 'fatal') {
    super(message);
    this.name = 'GovernProtocolError';
    this.exitCode = exitCode;
    this.terminalKind = terminalKind;
  }
}

/** A non-zero barrage exit is one of two machine-distinguishable terminal kinds. */
export type BarrageFailureKind = Extract<
  GovernTerminalKind,
  'fleet-floor-shortfall' | 'barrage-outage'
>;

/**
 * The dedicated diagnostic-line prefix the barrage emits when the covering fleet falls
 * short of the cross-model floor (`renderFleetWarnings` in audit-barrage-fleet.ts). govern
 * classifies a non-zero barrage exit by matching THIS marker at a line start — never a blob
 * substring — so the emit site and the parse sites (protocol.ts, end-govern-runtime.ts)
 * share ONE source of truth and incidental stderr (echoed prompts, command traces) cannot
 * misclassify an outage as a shortfall (TASK-119 / AUDIT-20260614-92).
 */
export const FLEET_FLOOR_SHORTFALL_MARKER = 'audit-barrage: FLOOR SHORTFALL';

const FLOOR_SHORTFALL_LINE = new RegExp(
  `^${FLEET_FLOOR_SHORTFALL_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  'm',
);

/**
 * Classify a non-zero barrage exit. A FLOOR SHORTFALL = coverage produced but fewer emitting
 * model families than the cross-model floor demands; anything else = OUTAGE (no covering
 * family). Matches the barrage's own marker line, anchored to a line start.
 */
export function classifyBarrageFailure(barrageStderr: string): BarrageFailureKind {
  return FLOOR_SHORTFALL_LINE.test(barrageStderr) ? 'fleet-floor-shortfall' : 'barrage-outage';
}

/** The short human label for a barrage-failure kind (the FATAL-line subject). */
export function barrageFailureLabel(kind: BarrageFailureKind): string {
  return kind === 'fleet-floor-shortfall' ? 'fleet-floor shortfall' : 'audit-barrage OUTAGE';
}

/**
 * Kind-specific recovery advice (TASK-126 / AUDIT-20260614-92). A floor shortfall is
 * recovered by widening the fleet or lowering the floor; an outage by making the model CLIs
 * reachable. Printing outage advice for a shortfall (the prior bug — both kinds shared the
 * outage string) points the operator at the wrong fix.
 */
export function barrageFailureRecovery(kind: BarrageFailureKind): string {
  return kind === 'fleet-floor-shortfall'
    ? 'Widen the fleet or lower --require-models so enough model families cover the cross-model floor.'
    : 'Check that the configured model-family CLIs are installed and reachable.';
}

/** The substitution values the barrage prompt renderer consumes (mode-aware). */
export interface BarrageVars {
  readonly feature_slug: string;
  readonly workplan_summary: string;
  readonly diff: string;
  readonly audit_log_excerpt: string;
  readonly commit_subjects: string;
  /**
   * Mode-aware lens for the prompt's "What to look for" section. Implement mode supplies
   * CODE_AUDIT_LENS (code-quality / edge-case checklist); spec mode supplies SPEC_AUDIT_LENS
   * (promise / decision / contradiction / ambiguity altitude). Keeping the lens as data keeps
   * the render mode-agnostic.
   */
  readonly audit_lens: string;
  /**
   * Mode-aware framing for the prompt's "Under audit" section — how to read the folded
   * artifact (code-with-line-anchors vs. spec-as-promises). CODE_* for implement, SPEC_* for
   * spec.
   */
  readonly artifact_framing: string;
}
