// 026 T023 — `stackctl capability reconcile` (US3 backstop, contracts/cli-verbs.md). The
// harmless-bypass reconciler: it flags backend state present WITHOUT a corresponding
// governance record — i.e. spec-execution work (a feature's tasks.md) that has no CONVERGED
// whole-feature governance record, the residue of a bypassed front door. REPORT-ONLY (exit
// 0, never mutates) — it surfaces what the governing→shipped graduate gate would refuse,
// for operator attention. 030 (FR-018/025) collapsed governance to the single whole-feature
// `WholeFeatureConvergenceRecord`; this backstop reads exactly the signal the gate reads
// (`isImplFeatureConverged`), keyed by the feature's roadmap node. In a separate module so
// the Phase-4 capability.ts (capability list) is not edited by this phase.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { InstallationError } from '../config/errors.js';
import { findInstallation } from '../config/installation.js';
import type { Installation } from '../config/types.js';
import { resolveConvergenceItem } from '../govern/feature-resolution.js';
import { isImplFeatureConverged } from '../govern/chunk-artifacts.js';

/** One un-governed-state finding (data-model § UngovernedState). */
export interface ReconcileFinding {
  readonly capability: string;
  /** The feature whose spec-execution state is un-governed. */
  readonly evidence: string;
  /** Why it is un-governed: no converged whole-feature record, or the feature dir does not
   *  resolve to a roadmap node (orphan/legacy — the gate cannot key it). */
  readonly reason: string;
}

/** Is `path` a directory? Returns false (rather than throwing) on a broken symlink or a
 *  vanished entry (claude-04) — a report-only scan must not crash on a debris entry. */
function isDirectorySafe(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Scan the installation's spec features and flag any whose spec-execution state is
 * un-governed — i.e. exactly what the governing→shipped graduate gate would refuse (the
 * report-only half of the US3 backstop must agree with the gate): a feature with a tasks.md
 * but no CONVERGED `WholeFeatureConvergenceRecord` (`isImplFeatureConverged` false), or a
 * feature dir that does not resolve to a roadmap node (orphan/legacy — the gate cannot key
 * the record by canonical identity). Pure read; no mutation. A single unresolvable feature
 * is reported, NOT fatal to the whole scan (claude-02).
 */
export function reconcileCapabilities(installation: Installation): ReconcileFinding[] {
  const specsDir = join(installation.root, 'specs');
  if (!existsSync(specsDir)) return [];
  const findings: ReconcileFinding[] = [];
  for (const entry of readdirSync(specsDir).sort()) {
    const featureDir = join(specsDir, entry);
    const tasksPath = join(featureDir, 'tasks.md');
    if (!isDirectorySafe(featureDir) || !existsSync(tasksPath)) continue;
    try {
      // Resolve the feature dir to the roadmap node id the gate keys the record by — the
      // SAME `resolveConvergenceItem` govern wrote with (an orphan throws; reported below).
      const item = resolveConvergenceItem(installation, featureDir, entry);
      if (!isImplFeatureConverged(installation.root, item)) {
        findings.push({
          capability: 'spec-execution',
          evidence: entry,
          reason: 'no converged whole-feature governance record',
        });
      }
    } catch (err) {
      // An orphan/legacy feature (no roadmap node) is reported, not fatal to the scan
      // (claude-02). The gate would refuse it too — it cannot key a record by identity.
      const detail = err instanceof Error ? err.message : String(err); // no `as` (project rule)
      findings.push({ capability: 'spec-execution', evidence: entry, reason: `unresolvable: ${detail}` });
    }
  }
  return findings;
}

export interface ReconcileResult {
  readonly code: 0;
  readonly stdout: string;
}

/** Render the reconcile findings (report-only). `--json` for adapters; human by default. */
export function renderReconcile(findings: readonly ReconcileFinding[], json: boolean): ReconcileResult {
  if (json) return { code: 0, stdout: `${JSON.stringify({ findings }, null, 2)}\n` };
  if (findings.length === 0) {
    return { code: 0, stdout: 'capability reconcile: no un-governed backend state found.\n' };
  }
  const lines = ['capability reconcile: un-governed backend state (would not graduate):', ''];
  for (const f of findings) {
    lines.push(`  ● ${f.capability} — ${f.evidence}: ${f.reason}`);
  }
  return { code: 0, stdout: `${lines.join('\n')}\n` };
}

export interface ReconcileVerbResult {
  readonly code: 0 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

/** The `capability reconcile [--at <dir>] [--json]` verb core. Resolves the enclosing
 *  installation and reports un-governed state — report-only (never mutates). No
 *  installation (not-found) → empty report (exit 0); an AMBIGUOUS/invalid installation
 *  surfaces as a clean exit-2 usage error rather than an uncaught throw (claude-01). */
export function reconcileVerb(args: readonly string[]): ReconcileVerbResult {
  let json = false;
  let at: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json') json = true;
    else if (arg === '--at') {
      const value = args[i + 1];
      // Reject a missing value AND a following flag (AUDIT-20260618-139): `--at
      // --json` must not swallow `--json` as the path (→ install root `--json` →
      // not-found → false "all clean").
      if (value === undefined || value.startsWith('--')) {
        return { code: 2, stdout: '', stderr: 'capability reconcile: --at requires a value\n' };
      }
      at = value;
      i++;
    } else {
      return { code: 2, stdout: '', stderr: `capability reconcile: unexpected argument '${arg}'\n` };
    }
  }

  let installation: Installation | null;
  try {
    installation = findInstallation(at ?? process.cwd()); // null on not-found
  } catch (err) {
    if (err instanceof InstallationError) {
      return { code: 2, stdout: '', stderr: `capability reconcile: ${err.message}\n` };
    }
    throw err;
  }
  const findings = installation === null ? [] : reconcileCapabilities(installation);
  return { ...renderReconcile(findings, json), stderr: '' };
}

/** Thin CLI wrapper for `capability reconcile` (cli.ts dispatches here on the reconcile
 *  subaction so the Phase-4 `capability.ts` list verb stays list-only). */
export async function runReconcileCli(args: string[]): Promise<void> {
  const result = reconcileVerb(args);
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exit(result.code);
}
