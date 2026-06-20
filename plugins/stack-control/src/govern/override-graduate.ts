/**
 * plugins/stack-control/src/govern/override-graduate.ts
 *
 * specs/029-govern-operability — Phase 4 / US4 (T028, FR-017/018).
 *
 * The `--override` short-circuit. When the operator supplies `--override
 * "<reason>"`, govern MUST graduate the invocation WITHOUT firing any
 * render/barrage/lift/slush pass (FR-017): it records the override reason in the
 * audit trail (the convergence record + the attributable "OPEN by override" line)
 * and returns. The override is per-invocation short-circuit ONLY (FR-018) — it
 * persists NO fingerprint-keyed marker across invocations; persistence across code
 * changes is explicitly not built (a fresh audit after a real change is correct).
 *
 * This module is the decision-free seam govern routes the override through; the
 * caller resolves the installation/feature/item and supplies the write sinks.
 */

import { recordGovernConvergence, type GovernMode } from './convergence-record.js';

export interface OverrideGraduateArgs {
  readonly installationRoot: string;
  readonly mode: GovernMode;
  /**
   * The canonical roadmap node id the convergence record is keyed by. specs/029 US4
   * (FINDING 2): REQUIRED — the caller resolves it (failing loud when no node
   * resolves) BEFORE calling this, so a clean override graduation ALWAYS writes a
   * durable record and the CLI success never diverges from the gate signal.
   */
  readonly convergenceItem: string;
  /** Scope paths fingerprinted into the record (the resolved feature root, if any). */
  readonly scopePaths: readonly string[];
  readonly feature: string;
  readonly reason: string;
  readonly recordedAt: string;
  readonly stderr: (s: string) => void;
}

/**
 * Record an attributable override graduation — firing zero barrage work. The DURABLE
 * convergence record is written FIRST; a write failure PROPAGATES (this function does
 * NOT swallow it). That is the load-bearing fix for AUDIT-BARRAGE codex-01 (HIGH) /
 * claude-03: the CLI must NOT report a graduation the durable `governing → shipped`
 * gate signal does not back — the US4 Finding-2 "CLI success ⟺ gate signal" principle,
 * extended to the record-WRITE-failure case (previously this warned and let the caller
 * exit 0). The caller maps a throw to a FATAL non-zero exit, so a green CLI always
 * means the record landed. The caller resolves `convergenceItem` (failing loud when no
 * node resolves) BEFORE calling this.
 *
 * The attributable "OPEN by override — reason: <reason>" line is emitted only AFTER the
 * record lands (so a write-failure FATAL never prints a misleading gate-open line); it
 * preserves the gate's existing override-attribution wording.
 */
export function recordOverrideGraduation(args: OverrideGraduateArgs): void {
  // FR-018: pass the override reason so the DURABLE convergence record carries
  // `override: true` + `overrideReason` — a downstream consumer distinguishes this
  // short-circuit graduation from a real convergence (stderr is transient). A write
  // failure throws THROUGH to the caller (codex-01/claude-03) — no warn-and-continue.
  recordGovernConvergence(
    args.installationRoot,
    args.mode,
    args.convergenceItem,
    args.scopePaths,
    args.recordedAt,
    args.reason,
  );
  // Record landed → emit the attributable trail (FR-018), distinguishable from a
  // convergence graduation. PRESERVE the gate's wording ("OPEN by override — reason: …").
  args.stderr(
    `spec-governance gate [${args.feature}]: OPEN by override — reason: ${args.reason}\n`,
  );
  args.stderr(
    `govern: --override supplied — short-circuiting the convergence pass ` +
      `(FR-017: zero render/barrage/lift/slush). Per-invocation only (FR-018): no ` +
      `marker persists across invocations.\n`,
  );
}
