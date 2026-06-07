// `stackctl spec-governance-gate --feature <slug>` (T017 + T018).
//
// The protocol port (research R3/R4): turns the per-feature audit-barrage run
// history into a graduation VERDICT by reusing the dw-lifecycle convergence
// logic (`check-barrage-dampener` Rule A/Rule B) — the SAME function, imported
// in-house, NOT a hand-retyped approximation (Principle VIII / convergence-gate
// assertion #7). The only new behavior is the wiring: in dw-lifecycle the
// dampener decides slush-vs-promote disposition; here the criterion decides
// whether a spec may graduate to the next Spec Kit step (SC-007).
//
// Fail-loud (Principle V / FR-005): a missing audit-log / unresolvable feature
// NEVER yields a verdict — exit 2, no "governed" claim. The convergence loop is
// bounded by --ceiling (FR-014): once iterations >= ceiling without convergence
// the verdict is `non-converged` (escalate), never an infinite spin.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
// The ported convergence criterion + the feature-root resolver, now VENDORED
// in-package (multi/migrate-audit-barrage) — no dw-lifecycle dependency.
import { checkBarrageDampener } from '../scope-discovery/promote-findings/check-barrage-dampener.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import {
  countIterations,
  filterByCheckpoint,
} from '../scope-discovery/promote-findings/checkpoint-filter.js';

const DEFAULT_CEILING = 5;
// Audit-protocol threshold (FR-010): Rule A = last 2 consecutive runs each 0
// HIGH. Fixed by the protocol, not a tunable here.
const PROTOCOL_THRESHOLD = 2;

type ConvergenceState = 'converged' | 'blocked' | 'non-converged' | 'overridden';
type ConvergenceRule = 'single-run-clean' | 'n-consecutive-quiet' | 'none';

interface ConvergenceVerdict {
  readonly feature: string;
  /** The checkpoint this verdict is scoped to, or null for the whole audit-log. */
  readonly checkpoint: string | null;
  readonly state: ConvergenceState;
  readonly rule: ConvergenceRule;
  readonly iterations: number;
  readonly ceiling: number;
  readonly openHigh: number;
  readonly openMedium: number;
  readonly override: { readonly recorded: boolean; readonly reason?: string };
}

interface GateOptions {
  readonly feature: string;
  readonly ceiling: number;
  readonly override?: string;
  readonly repoRoot?: string;
  /** Scope convergence to runs tagged with this checkpoint (AUDIT-20260607-05). */
  readonly checkpoint?: string;
  readonly json: boolean;
}

const USAGE = [
  'Usage: stackctl spec-governance-gate',
  '    --feature <slug>          Required. Evaluates the feature audit-log + run history.',
  '    [--ceiling <N>]           Max iterations before non-converged (default 5).',
  '    [--override "<reason>"]    Record an explicit override (reason mandatory).',
  '    [--checkpoint <name>]     Scope convergence to runs for this checkpoint only',
  '                              (per-checkpoint independent loops, FR-011/FR-014).',
  '    [--repo-root <path>]      Project root (default: cwd).',
  '    [--json]                  Emit the ConvergenceVerdict as JSON only.',
  '',
  'Exit codes: 0 converged/overridden (may graduate); 1 blocked/non-converged',
  '            (graduation refused); 2 fatal (feature/audit-log absent).',
].join('\n');

function parseArgs(args: string[]): GateOptions {
  let feature: string | undefined;
  let ceiling = DEFAULT_CEILING;
  let override: string | undefined;
  let repoRoot: string | undefined;
  let checkpoint: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (
      token === '--feature' ||
      token === '--ceiling' ||
      token === '--override' ||
      token === '--repo-root' ||
      token === '--checkpoint'
    ) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`spec-governance-gate: ${token} requires a value\n`);
        process.exit(2);
      }
      i++;
      if (token === '--feature') feature = value;
      else if (token === '--repo-root') repoRoot = value;
      else if (token === '--override') override = value;
      else if (token === '--checkpoint') checkpoint = value;
      else {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          process.stderr.write(`spec-governance-gate: --ceiling must be a positive integer (got '${value}')\n`);
          process.exit(2);
        }
        ceiling = parsed;
      }
      continue;
    }
    process.stderr.write(`spec-governance-gate: unexpected argument '${token}'\n${USAGE}\n`);
    process.exit(2);
  }
  if (feature === undefined) {
    process.stderr.write(`spec-governance-gate: --feature <slug> required\n${USAGE}\n`);
    process.exit(2);
  }
  return {
    feature,
    ceiling,
    json,
    ...(override !== undefined ? { override } : {}),
    ...(repoRoot !== undefined ? { repoRoot } : {}),
    ...(checkpoint !== undefined ? { checkpoint } : {}),
  };
}

export async function runSpecGovernanceGate(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  const repoRoot = opts.repoRoot !== undefined
    ? (isAbsolute(opts.repoRoot) ? opts.repoRoot : resolve(process.cwd(), opts.repoRoot))
    : process.cwd();

  const { root: featureRoot } = await resolveFeatureRoot({ repoRoot, slug: opts.feature });
  if (featureRoot === undefined) {
    process.stderr.write(
      `spec-governance-gate: FATAL — feature '${opts.feature}' not found under ${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/ (no verdict; spec NOT governed).\n`,
    );
    process.exit(2);
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    process.stderr.write(
      `spec-governance-gate: FATAL — audit-log not found at ${auditLogPath} (no verdict; spec NOT governed).\n`,
    );
    process.exit(2);
  }

  const auditLogTextRaw = await readFile(auditLogPath, 'utf8');
  // Per-checkpoint independent loops (AUDIT-20260607-05): scope evaluation to the
  // runs for one checkpoint when --checkpoint is given; otherwise evaluate all.
  const auditLogText =
    opts.checkpoint !== undefined
      ? filterByCheckpoint(auditLogTextRaw, opts.checkpoint)
      : auditLogTextRaw;

  // --- the PORTED criterion (the load-bearing reuse) ---
  const dampener = checkBarrageDampener({ auditLogText, threshold: PROTOCOL_THRESHOLD });
  const mostRecent = dampener.recentRunCounts[0];
  const openHigh = mostRecent?.highPlusCount ?? 0;
  const openMedium = mostRecent?.mediumCount ?? 0;
  const iterations = countIterations(auditLogText);

  // Which rule engaged — derived from the SAME recentRunCounts the dampener
  // produced (so converged iff dampener.dampened; assertion #7 holds).
  const singleRunClean =
    mostRecent !== undefined && mostRecent.highPlusCount === 0 && mostRecent.mediumCount === 0;
  const nConsecutiveQuiet =
    dampener.recentRunCounts.length >= PROTOCOL_THRESHOLD &&
    dampener.recentRunCounts.every((r) => r.highPlusCount === 0);

  let state: ConvergenceState;
  let rule: ConvergenceRule = 'none';
  let overrideRecorded = false;

  if (dampener.dampened) {
    state = 'converged';
    rule = singleRunClean ? 'single-run-clean' : nConsecutiveQuiet ? 'n-consecutive-quiet' : 'none';
  } else if (opts.override !== undefined) {
    // Operator explicitly accepts residual findings — wins over ceiling.
    state = 'overridden';
    overrideRecorded = true;
  } else if (iterations >= opts.ceiling) {
    state = 'non-converged';
  } else {
    state = 'blocked';
  }

  const verdict: ConvergenceVerdict = {
    feature: opts.feature,
    checkpoint: opts.checkpoint ?? null,
    state,
    rule,
    iterations,
    ceiling: opts.ceiling,
    openHigh,
    openMedium,
    override: overrideRecorded
      ? { recorded: true, reason: opts.override }
      : { recorded: false },
  };

  const mayGraduate = state === 'converged' || state === 'overridden';

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(verdict)}\n`);
  } else {
    process.stdout.write(
      `spec-governance gate [${opts.feature}]: ${state}` +
        (rule !== 'none' ? ` (${rule})` : '') +
        ` — open HIGH=${openHigh}, MED=${openMedium}, iterations=${iterations}/${opts.ceiling}\n`,
    );
    process.stdout.write(`${JSON.stringify(verdict)}\n`);
    if (!mayGraduate) {
      process.stderr.write(
        `spec-governance gate: graduation REFUSED (${state}). Fix findings & re-govern, or record an --override "<reason>".\n`,
      );
    }
  }

  process.exit(mayGraduate ? 0 : 1);
}
