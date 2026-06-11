// `stackctl spec-governance-gate --feature <slug>` (T017 + T018).
//
// The convergence gate. It owns the FR-010 graduation POLICY in exactly one
// place and returns a single decision the consumer OBEYS — it is never left to
// an agent to re-derive policy from a richer output (#432, operator directive
// 2026-06-08). Concretely:
//
//   * stdout is ONLY `true` or `false` — `true` = gate OPEN (graduation
//     permitted / unblocked); `false` = BLOCKED (keep barraging). Nothing else
//     is printed to stdout, so a caller reads exactly one boolean.
//   * the EXIT CODE encodes execution status, NOT policy: 0 = the gate
//     evaluated successfully (whatever the boolean), 2 = fatal / could-not-
//     evaluate (missing audit-log / unresolvable feature — fail loud, FR-005,
//     never a "governed" claim). There is no exit-1-means-blocked: blocked is a
//     normal, successful evaluation that prints `false`.
//
// The policy itself (#432 / AUDIT-20260608-01): the gate is OPEN iff the
// FR-010 dampener is engaged (`check-barrage-dampener`, computed on what each
// run RAW-SURFACED — see that module) OR an explicit `--override` is supplied.
// The count of still-open findings has NO bearing (operator directive) — the
// recent-run convergence signal is the whole policy; detection is the barrage's
// job. Loop bounding (FR-014 ceiling) belongs to the loop driver, not here.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
// The ported convergence criterion + the feature-root resolver, VENDORED
// in-package (multi/migrate-audit-barrage) — no dw-lifecycle dependency.
import { checkBarrageDampener } from '../scope-discovery/promote-findings/check-barrage-dampener.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { filterByCheckpoint } from '../scope-discovery/promote-findings/checkpoint-filter.js';

// Audit-protocol threshold (FR-010): branch (b) = last 2 consecutive runs each
// 0 HIGH. Fixed by the protocol, not a tunable here.
const PROTOCOL_THRESHOLD = 2;

interface GateOptions {
  readonly feature: string;
  readonly override?: string;
  readonly repoRoot?: string;
  /** Scope convergence to runs tagged with this checkpoint (AUDIT-20260607-05). */
  readonly checkpoint?: string;
}

const USAGE = [
  'Usage: stackctl spec-governance-gate',
  '    --feature <slug>          Required. Evaluates the feature audit-log + run history.',
  '    [--override "<reason>"]    Force the gate OPEN, recording a mandatory reason.',
  '    [--checkpoint <name>]     Scope convergence to runs for this checkpoint only',
  '                              (per-checkpoint independent loops, FR-011).',
  '    [--repo-root <path>]      Project root (default: cwd).',
  '',
  'Prints exactly `true` (gate OPEN — may graduate) or `false` (BLOCKED) to stdout.',
  'Exit codes: 0 evaluated successfully (read stdout for the decision);',
  '            2 fatal — could not evaluate (feature/audit-log absent, no decision).',
].join('\n');

function parseArgs(args: string[]): GateOptions {
  let feature: string | undefined;
  let override: string | undefined;
  let repoRoot: string | undefined;
  let checkpoint: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--help' || token === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    // `--ceiling`/`--json` are accepted-and-ignored for back-compat with callers
    // that still pass them: loop bounding moved to the loop driver, and the
    // output is always the bare boolean (no JSON verdict).
    if (token === '--ceiling') {
      i++; // consume the value
      continue;
    }
    if (token === '--json') {
      continue;
    }
    if (
      token === '--feature' ||
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
      else checkpoint = value;
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
      `spec-governance-gate: FATAL — feature '${opts.feature}' not found under ` +
        `${join(repoRoot, 'specs')}/<NNN>-${opts.feature} (speckit) or ` +
        `${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/${opts.feature} (legacy-docs) ` +
        `(no decision; spec NOT governed).\n`,
    );
    process.exit(2);
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    process.stderr.write(
      `spec-governance-gate: FATAL — audit-log not found at ${auditLogPath} (no decision; spec NOT governed).\n`,
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

  // The ONE policy decision (#432): the gate is OPEN iff the FR-010 dampener is
  // engaged (computed on RAW-surfaced severity inside check-barrage-dampener) OR
  // the operator forced it with --override. No open-finding union, no ceiling,
  // no rule label — a single boolean the consumer obeys.
  const dampener = checkBarrageDampener({ auditLogText, threshold: PROTOCOL_THRESHOLD });
  const overridden = opts.override !== undefined;
  const open = dampener.dampened || overridden;

  // stdout: ONLY the boolean. Everything human-readable goes to stderr so the
  // machine-read channel stays a single token.
  process.stdout.write(`${open ? 'true' : 'false'}\n`);
  if (overridden) {
    process.stderr.write(
      `spec-governance gate [${opts.feature}]: OPEN by override — reason: ${opts.override}\n`,
    );
  } else {
    process.stderr.write(
      `spec-governance gate [${opts.feature}]: ${open ? 'OPEN' : 'BLOCKED'} — ${dampener.reason}\n`,
    );
  }
  // Exit 0: the gate evaluated successfully (the decision is on stdout). Failed
  // execution (could-not-evaluate) already exited 2 above.
  process.exit(0);
}
