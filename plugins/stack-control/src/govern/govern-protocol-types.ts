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
