// 026 T023 — `stackctl capability reconcile` (US3 backstop, contracts/cli-verbs.md). The
// harmless-bypass reconciler: it flags backend state present WITHOUT a corresponding
// governance record — i.e. spec-execution work (a feature's tasks.md phases) that lacks a
// current per-phase checkpoint, the residue of a bypassed front door. REPORT-ONLY (exit 0,
// never mutates) — it surfaces what the graduate gate would refuse, for operator attention.
// Reuses the per-phase checkpoint status primitive (no new gate). In a separate module so
// the Phase-4 capability.ts (capability list) is not edited by this phase.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { InstallationError } from '../config/errors.js';
import { findInstallation } from '../config/installation.js';
import { featureCheckpointKey, resolvePhaseCheckpointStatuses } from '../govern/phase-checkpoint-status.js';

/** One un-governed-state finding (data-model § UngovernedState). */
export interface ReconcileFinding {
  readonly capability: string;
  /** The feature whose spec-execution state is un-governed. */
  readonly evidence: string;
  /** The non-current phases (missing/stale checkpoints); empty for a whole-feature reason. */
  readonly phases: { readonly phaseId: string; readonly state: 'missing' | 'stale' }[];
  /** A whole-feature reason when there are no per-phase rows to cite (no phases / malformed). */
  readonly reason?: string;
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
 * un-governed — i.e. exactly what the all-phase-checkpoints-current graduate gate would
 * refuse (the report-only half of the US3 backstop must agree with the gate): a phase
 * with a missing/stale checkpoint, a tasks.md with NO governable phases (the gate refuses
 * it too — claude-01/codex-01), or a malformed phase set. Pure read; no mutation. A single
 * unreadable feature is reported, NOT fatal to the whole scan (claude-02).
 */
export function reconcileCapabilities(installRoot: string): ReconcileFinding[] {
  const specsDir = join(installRoot, 'specs');
  if (!existsSync(specsDir)) return [];
  const findings: ReconcileFinding[] = [];
  for (const entry of readdirSync(specsDir).sort()) {
    const featureDir = join(specsDir, entry);
    const tasksPath = join(featureDir, 'tasks.md');
    if (!isDirectorySafe(featureDir) || !existsSync(tasksPath)) continue;
    const slug = featureCheckpointKey(featureDir);
    try {
      const statuses = resolvePhaseCheckpointStatuses(installRoot, slug, tasksPath);
      if (statuses.length === 0) {
        // No governable phases — the graduate gate refuses this too; flag it so the
        // report-only half does not falsely read clean (claude-01/codex-01).
        findings.push({ capability: 'spec-execution', evidence: entry, phases: [], reason: 'no governable phases' });
        continue;
      }
      const nonCurrent = statuses
        .filter((s): s is typeof s & { state: 'missing' | 'stale' } => s.state !== 'current')
        .map((s) => ({ phaseId: s.phaseId, state: s.state }));
      if (nonCurrent.length > 0) {
        findings.push({ capability: 'spec-execution', evidence: entry, phases: nonCurrent });
      }
    } catch (err) {
      // A malformed phase set in ONE feature is reported, not fatal to the scan (claude-02).
      findings.push({ capability: 'spec-execution', evidence: entry, phases: [], reason: `unreadable: ${(err as Error).message}` });
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
    const detail = f.phases.length > 0 ? f.phases.map((p) => `${p.state} phase-${p.phaseId}`).join(', ') : (f.reason ?? 'un-governed');
    lines.push(`  ● ${f.capability} — ${f.evidence}: ${detail}`);
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
      if (value === undefined) {
        return { code: 2, stdout: '', stderr: 'capability reconcile: --at requires a value\n' };
      }
      at = value;
      i++;
    } else {
      return { code: 2, stdout: '', stderr: `capability reconcile: unexpected argument '${arg}'\n` };
    }
  }

  let installRoot: string | null;
  try {
    installRoot = findInstallation(at ?? process.cwd())?.root ?? null; // null on not-found
  } catch (err) {
    if (err instanceof InstallationError) {
      return { code: 2, stdout: '', stderr: `capability reconcile: ${err.message}\n` };
    }
    throw err;
  }
  const findings = installRoot === null ? [] : reconcileCapabilities(installRoot);
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
