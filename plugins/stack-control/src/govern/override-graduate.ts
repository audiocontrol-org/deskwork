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
 * Record an attributable override graduation and return — firing zero barrage
 * work. The "OPEN by override — reason: <reason>" line preserves the gate's
 * existing override-attribution content (a consumer keying on it sees the same
 * record whether the gate or the short-circuit produced it). The convergence
 * record makes the workflow `governing → shipped` gate mechanical even on an
 * override graduation. The caller resolves `convergenceItem` (failing loud when no
 * node resolves) BEFORE calling this, so a clean override graduation ALWAYS writes
 * the record. A subsequent record-write failure (fs error) is surfaced as a WARNING
 * (the gate stays CLOSED until the record lands) — mirroring the convergence
 * graduation's fail-safe.
 */
export function recordOverrideGraduation(args: OverrideGraduateArgs): void {
  // Attributable in the audit trail (FR-018) — distinguishable from a convergence
  // graduation. PRESERVE the gate's wording ("OPEN by override — reason: …").
  args.stderr(
    `spec-governance gate [${args.feature}]: OPEN by override — reason: ${args.reason}\n`,
  );
  args.stderr(
    `govern: --override supplied — short-circuiting the convergence pass ` +
      `(FR-017: zero render/barrage/lift/slush). Per-invocation only (FR-018): no ` +
      `marker persists across invocations.\n`,
  );
  try {
    // FR-018: pass the override reason so the DURABLE convergence record carries
    // `override: true` + `overrideReason` — a downstream consumer can distinguish
    // this short-circuit graduation from a real convergence (stderr is transient).
    recordGovernConvergence(
      args.installationRoot,
      args.mode,
      args.convergenceItem,
      args.scopePaths,
      args.recordedAt,
      args.reason,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    args.stderr(
      `govern: WARNING — could not write the govern-convergence record (${message}); ` +
        `the governing -> shipped gate stays CLOSED until it is recorded.\n`,
    );
  }
}
