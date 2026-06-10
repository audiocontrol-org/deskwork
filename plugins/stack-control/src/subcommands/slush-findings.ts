// `stackctl slush-findings --feature <slug>` — the slush-pile action (ported
// from dw-lifecycle slush-remaining via multi/migrate-audit-barrage; the
// workplan half is dropped — Spec-Kit features have no workplan.md, TF-12).
//
// The dampener DECISION (when to park: HIGH-quiet — 0 HIGH in the latest run +
// 0 MED, OR 2 consecutive 0-HIGH runs) lives in slush-remaining.ts, UNCHANGED.
// 008 REWIRE (US4): only the DESTINATION of a parked flip changed. Instead of
// flipping the residual MEDIUM/LOW findings to `acknowledged-slush-pile-<date>`,
// each parked finding becomes a `migrated-finding` backlog item and its audit-log
// entry records `Status: migrated-to-backlog <task-id>` — leaving the audit-log
// a clean open/fixed convergence ledger, with the backlog as the single burn-down
// queue (FR-016/FR-020/FR-022). HIGHs are NEVER slushed. Refuses to slush while
// the dampener is not engaged (real bugs still surfacing). `--burn-down` is
// removed — working the backlog IS the burn-down.
//
// --checkpoint scopes the dampener DECISION to one checkpoint's runs (the same
// per-checkpoint loop the gate uses).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';
import { slushRemaining } from '../scope-discovery/promote-findings/slush-remaining.js';
import { filterByCheckpoint } from '../scope-discovery/promote-findings/checkpoint-filter.js';
import { createBacklogBackend } from '../backlog/backend.js';
import { backlogRoot } from '../backlog/root.js';
import { findFindingsByStatus, migrateFindings } from '../backlog/slush-migrate.js';

/** Open-status predicate for locating the flipped findings to migrate. */
const STATUS_OPEN_RE = /^Status:\s*open\b/i;

interface SlushOptions {
  readonly feature: string;
  readonly repoRoot?: string;
  readonly checkpoint?: string;
  readonly slushDate?: string;
  readonly scope: 'latest' | 'all';
  readonly apply: boolean;
}

const USAGE = [
  'Usage: stackctl slush-findings',
  '    --feature <slug>          Required.',
  '    [--checkpoint <name>]     Scope the dampener decision to one checkpoint.',
  '    [--slush-date <YYYY-MM-DD>] Date passed to the dampener decision (default: today UTC).',
  '    [--scope latest|all]      Sections to act on (default: latest).',
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

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--apply') { apply = true; continue; }
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
  // THIS barrage").
  const resolvedScope = scope ?? 'latest';
  return {
    feature,
    scope: resolvedScope,
    apply,
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

  const decisionAuditLogText =
    opts.checkpoint !== undefined ? filterByCheckpoint(text, opts.checkpoint) : undefined;
  const res = slushRemaining({
    auditLogText: text,
    workplanText: '',
    slushDate: opts.slushDate ?? todayUTC(),
    scope: opts.scope,
    ...(decisionAuditLogText !== undefined ? { decisionAuditLogText } : {}),
    // AUDIT-20260607-47: when scoping the dampener decision to a checkpoint,
    // also confine the FLIP to that checkpoint's runs so an `--scope all`
    // convergence slush never bins another checkpoint's findings (FR-011).
    ...(opts.checkpoint !== undefined ? { flipCheckpoint: opts.checkpoint } : {}),
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
  // 008 REWIRE: the destination is the backlog. The dampener DECISION above
  // (res.flips) is unchanged; here we route each parked flip to a migrated-finding
  // backlog item and record `migrated-to-backlog <task-id>` on its audit-log
  // entry — NOT `acknowledged-slush-pile`. We deliberately do NOT consume
  // res.newAuditLogText (which carries the old parked status); slush-remaining
  // stays frozen, we just stop using that one output.
  if (opts.apply) {
    const flipIds = new Set(res.flips.map((f) => f.findingId));
    const findings = findFindingsByStatus(text, STATUS_OPEN_RE).filter((f) => flipIds.has(f.findingId));
    const backend = createBacklogBackend({ cwd: backlogRoot() });
    const mig = migrateFindings({ auditLogText: text, findings, backend, featureSlug: opts.feature });
    await atomicWriteFile(auditLogPath, mig.newAuditLogText);
    process.stdout.write(
      `slush-findings: APPLIED — migrated ${mig.migrated.length} finding(s) to the backlog: ${mig.migrated
        .map((m) => `${m.findingId}→${m.taskId}`)
        .join(', ')}\n`,
    );
  } else {
    process.stdout.write(
      `slush-findings: DRY-RUN — would migrate ${ids.length} finding(s) to the backlog: ${ids.join(', ')} (pass --apply to write)\n`,
    );
  }
  process.exit(0);
}
