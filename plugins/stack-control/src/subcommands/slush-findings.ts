// `stackctl slush-findings --feature <slug>` — the slush-pile action (ported
// from dw-lifecycle slush-remaining via multi/migrate-audit-barrage; the
// workplan half is dropped — Spec-Kit features have no workplan.md, TF-12).
//
// When the dampener is engaged (HIGH-quiet: 0 HIGH in the latest run + 0 MED, OR
// 2 consecutive 0-HIGH runs), bin the residual MEDIUM/LOW findings of the most
// recent barrage to `Status: acknowledged-slush-pile-<date>` — NOT fixed, NOT
// open — so the convergence loop terminates. HIGHs are NEVER slushed. Refuses to
// slush while the dampener is not engaged (real bugs still surfacing).
//
// --checkpoint scopes the dampener DECISION to one checkpoint's runs (the same
// per-checkpoint loop the gate uses). --burn-down re-opens slush-pile entries so
// a future pass can fix them ("go back through the slush pile and burn it down").

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';
import {
  slushRemaining,
  burnDownSlush,
} from '../scope-discovery/promote-findings/slush-remaining.js';
import { filterByCheckpoint } from '../scope-discovery/promote-findings/checkpoint-filter.js';

interface SlushOptions {
  readonly feature: string;
  readonly repoRoot?: string;
  readonly checkpoint?: string;
  readonly slushDate?: string;
  readonly scope: 'latest' | 'all';
  readonly apply: boolean;
  readonly burnDown: boolean;
}

const USAGE = [
  'Usage: stackctl slush-findings',
  '    --feature <slug>          Required.',
  '    [--checkpoint <name>]     Scope the dampener decision to one checkpoint.',
  '    [--slush-date <YYYY-MM-DD>] Date for the acknowledged-slush-pile-<date> tag (default: today UTC).',
  '    [--scope latest|all]      Sections to act on (default: latest for slush, all for burn-down).',
  '    [--burn-down]             Re-open slush-pile findings instead of slushing.',
  '    [--apply]                 Write the change (default: dry-run).',
  '    [--help]',
  '',
  'Exit: 0 proposed/applied/no-op; 2 config error (missing flag, feature not found).',
].join('\n');

function todayUTC(): string {
  const n = new Date();
  return `${n.getUTCFullYear().toString().padStart(4, '0')}-${(n.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${n.getUTCDate().toString().padStart(2, '0')}`;
}

function parseArgs(args: string[]): SlushOptions {
  let feature: string | undefined;
  let repoRoot: string | undefined;
  let checkpoint: string | undefined;
  let slushDate: string | undefined;
  let scope: 'latest' | 'all' | undefined;
  let apply = false;
  let burnDown = false;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--apply') { apply = true; continue; }
    if (token === '--burn-down') { burnDown = true; continue; }
    if (token === '--help' || token === '-h') { process.stdout.write(`${USAGE}\n`); process.exit(0); }
    if (
      token === '--feature' || token === '--repo-root' || token === '--checkpoint' ||
      token === '--slush-date' || token === '--scope'
    ) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`slush-findings: ${token} requires a value\n`);
        process.exit(2);
      }
      i++;
      if (token === '--feature') feature = value;
      else if (token === '--repo-root') repoRoot = value;
      else if (token === '--checkpoint') checkpoint = value;
      else if (token === '--slush-date') slushDate = value;
      else {
        if (value !== 'latest' && value !== 'all') {
          process.stderr.write(`slush-findings: --scope must be latest|all (got '${value}')\n`);
          process.exit(2);
        }
        scope = value;
      }
      continue;
    }
    process.stderr.write(`slush-findings: unexpected argument '${token}'\n${USAGE}\n`);
    process.exit(2);
  }
  if (feature === undefined) {
    process.stderr.write(`slush-findings: --feature <slug> required\n${USAGE}\n`);
    process.exit(2);
  }
  // Slush defaults to the latest barrage (operator intent: "items in scope of
  // THIS barrage"); burn-down defaults to the whole pile.
  const resolvedScope = scope ?? (burnDown ? 'all' : 'latest');
  return {
    feature,
    scope: resolvedScope,
    apply,
    burnDown,
    ...(repoRoot !== undefined ? { repoRoot } : {}),
    ...(checkpoint !== undefined ? { checkpoint } : {}),
    ...(slushDate !== undefined ? { slushDate } : {}),
  };
}

export async function runSlushFindings(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  const repoRoot =
    opts.repoRoot !== undefined
      ? isAbsolute(opts.repoRoot)
        ? opts.repoRoot
        : resolve(process.cwd(), opts.repoRoot)
      : process.cwd();

  const { root: featureRoot } = await resolveFeatureRoot({ repoRoot, slug: opts.feature });
  if (featureRoot === undefined) {
    process.stderr.write(`slush-findings: FATAL — feature '${opts.feature}' not found under ${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/.\n`);
    process.exit(2);
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    process.stderr.write(`slush-findings: FATAL — audit-log not found at ${auditLogPath}.\n`);
    process.exit(2);
  }
  const text = await readFile(auditLogPath, 'utf8');

  if (opts.burnDown) {
    const { reopened, newAuditLogText } = burnDownSlush({ auditLogText: text, scope: opts.scope });
    if (reopened.length === 0) {
      process.stderr.write('slush-findings: burn-down — no acknowledged-slush-pile findings to re-open.\n');
      process.exit(0);
    }
    if (opts.apply) {
      await atomicWriteFile(auditLogPath, newAuditLogText);
      process.stdout.write(`slush-findings: burn-down APPLIED — re-opened ${reopened.length} finding(s): ${reopened.map((r) => r.findingId).join(', ')}\n`);
    } else {
      process.stdout.write(`slush-findings: burn-down DRY-RUN — would re-open ${reopened.length} finding(s): ${reopened.map((r) => r.findingId).join(', ')} (pass --apply to write)\n`);
    }
    process.exit(0);
  }

  const decisionAuditLogText =
    opts.checkpoint !== undefined ? filterByCheckpoint(text, opts.checkpoint) : undefined;
  const res = slushRemaining({
    auditLogText: text,
    workplanText: '',
    slushDate: opts.slushDate ?? todayUTC(),
    scope: opts.scope,
    ...(decisionAuditLogText !== undefined ? { decisionAuditLogText } : {}),
  });

  if (!res.dampenerEngaged) {
    process.stderr.write(`slush-findings: dampener NOT engaged — not slushing (real findings still surfacing). ${res.dampenerReason}\n`);
    process.exit(0);
  }
  const ids = res.flips.map((f) => f.findingId);
  if (res.skippedHighs.length > 0) {
    process.stderr.write(`slush-findings: ${res.skippedHighs.length} HIGH+ finding(s) NEVER slushed (left open): ${res.skippedHighs.map((h) => h.findingId).join(', ')}\n`);
  }
  if (res.flips.length === 0) {
    process.stdout.write('slush-findings: dampener engaged, but no open MEDIUM/LOW findings in scope to slush (no-op).\n');
    process.exit(0);
  }
  if (opts.apply) {
    await atomicWriteFile(auditLogPath, res.newAuditLogText);
    process.stdout.write(`slush-findings: APPLIED — slushed ${ids.length} finding(s) to acknowledged-slush-pile: ${ids.join(', ')}\n`);
  } else {
    process.stdout.write(`slush-findings: DRY-RUN — would slush ${ids.length} finding(s): ${ids.join(', ')} (pass --apply to write)\n`);
  }
  process.exit(0);
}
