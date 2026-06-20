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
import { join } from 'node:path';
import { resolveCodebaseBoundary } from '../scope-discovery/codebase-boundary.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';
import { slushRemaining } from '../scope-discovery/promote-findings/slush-remaining.js';
import { filterByCheckpoint } from '../scope-discovery/promote-findings/checkpoint-filter.js';
import { createBacklogBackend } from '../backlog/backend.js';
import { backlogRoot } from '../backlog/root.js';
import { migrateFindings } from '../backlog/slush-migrate.js';
import { reconcileFixedFindings } from '../backlog/reconcile-fixed.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';

/** Expected status at each flip's recorded location (specs/014 US4 guard). */
const STATUS_OPEN_RE = /^Status:\s*open\b/i;

interface SlushOptions {
  readonly feature: string;
  /** Walk-up start override (`--at <dir>`); default: cwd (R1/R2). */
  readonly at?: string;
  readonly checkpoint?: string;
  readonly slushDate?: string;
  readonly scope: 'latest' | 'all';
  readonly apply: boolean;
}

const USAGE = [
  'Usage: stackctl slush-findings',
  '    --feature <slug>          Required.',
  '    [--at <dir>]              Resolve the installation enclosing <dir> (default: cwd).',
  '    [--checkpoint <name>]     Scope the dampener decision to one checkpoint.',
  '    [--slush-date <YYYY-MM-DD>] Date passed to the dampener decision (default: today UTC).',
  '    [--scope latest|all]      Sections to act on (default: latest).',
  '    [--apply]                 Write the change (default: dry-run).',
  '    [--help]',
  '',
  'Exit: 0 proposed/applied/no-op; 1 apply failure (a decided flip could not',
  '      be located — audit-log changed between decision and apply; nothing',
  '      written); 2 config error (missing flag, feature not found).',
].join('\n');

function todayUTC(): string {
  const n = new Date();
  return `${n.getUTCFullYear().toString().padStart(4, '0')}-${(n.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${n.getUTCDate().toString().padStart(2, '0')}`;
}

function parseArgs(args: string[]): SlushOptions {
  let feature: string | undefined;
  let at: string | undefined;
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
      token === '--feature' || token === '--at' || token === '--checkpoint' ||
      token === '--slush-date' || token === '--scope'
    ) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write(`slush-findings: ${token} requires a value\n`);
        process.exit(2);
      }
      i++;
      if (token === '--feature') feature = value;
      else if (token === '--at') at = value;
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
    ...(at !== undefined ? { at } : {}),
    ...(checkpoint !== undefined ? { checkpoint } : {}),
    ...(slushDate !== undefined ? { slushDate } : {}),
  };
}

export async function runSlushFindings(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  // specs/installation-isolation US1 (R1): the audit-log target resolves
  // through the nearest-enclosing installation (walk-up from --at <dir>,
  // else the cwd); the free repo-root parameter is retired (R2).
  let repoRoot: string;
  try {
    repoRoot = resolveCodebaseBoundary({
      startDir: opts.at ?? process.cwd(),
      explicitRoot: null,
    }).installationRoot;
  } catch (err) {
    process.stderr.write(`slush-findings: FATAL — ${errorMessage(err)}\n`);
    process.exit(2);
  }

  const { root: featureRoot } = await resolveFeatureRoot({ repoRoot, slug: opts.feature });
  if (featureRoot === undefined) {
    process.stderr.write(`slush-findings: FATAL — feature '${opts.feature}' not found under ${join(repoRoot, 'specs')}/<NNN>-${opts.feature} (speckit) or ${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/${opts.feature} (legacy-docs).\n`);
    process.exit(2);
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    process.stderr.write(`slush-findings: FATAL — audit-log not found at ${auditLogPath}.\n`);
    process.exit(2);
  }
  const text = await readFile(auditLogPath, 'utf8');

  // specs/029 US4 (FR-013): a `fixed-<sha>` finding is RESOLVED — it must never be
  // migrated to the backlog. The slush picks ONLY `Status: open` findings
  // (slush-remaining's STATUS_OPEN_RE gate; the migrate path additionally asserts
  // expectedStatusRe = STATUS_OPEN_RE), so a `fixed-<sha>` entry is structurally
  // excluded from the flip set — there is no separate filter to apply here, by
  // construction. Locked by tests/promote-findings/never-lift-fixed.test.ts.
  //
  // specs/029 US4 (FR-015): auto-reconcile — close any backlog task referenced by
  // a now-`fixed-<sha>` finding via the SAME terminal `backlog done` close path.
  // The audit-log is the source of truth for "fixed"; the migrated-finding task
  // follows it. Idempotent (already-Done / no-task → no-op), so running it on
  // --apply (the protocol invokes slush only at the loop terminal, FR-014) is
  // safe. A backend close error is fail-loud (exit 1).
  // AUDIT-BARRAGE claude-04: run reconcile on BOTH paths. On --apply it closes; on a
  // dry-run it PREVIEWS the would-close set (no mutation) so the dry-run output is
  // complete — an operator previewing slush sees the reconcile candidates too.
  // AUDIT-BARRAGE claude-05: reconcile is DELIBERATELY holistic — it reads the FULL
  // audit log (`text`), NOT the `--checkpoint`-scoped slice the slush pass uses. A
  // `fixed-<sha>` finding's burn-down task must close whenever reconcile runs,
  // regardless of which checkpoint a slush pass targets (FR-015: "ANY backlog task
  // that referenced that finding"); scoping it would leave a fixed finding's task open
  // just because the slush ran against a different checkpoint. The stderr line below
  // names every task closed, so the holistic effect is visible.
  try {
    const reconcileBackend = createBacklogBackend({ cwd: backlogRoot(repoRoot) });
    const rec = reconcileFixedFindings({
      auditLogText: text,
      backend: reconcileBackend,
      featureSlug: opts.feature,
      dryRun: !opts.apply,
    });
    if (rec.reconciled.length > 0) {
      const detail = rec.reconciled.map((r) => `${r.taskId} (${r.findingId})`).join(', ');
      process.stdout.write(
        opts.apply
          ? `slush-findings: reconciled ${rec.reconciled.length} fixed finding(s) — closed ${detail}\n`
          : `slush-findings: [dry-run] would close ${rec.reconciled.length} reconciled task(s) — ${detail}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(`slush-findings: FATAL — auto-reconcile failed: ${errorMessage(err)}\n`);
    process.exit(1);
  }

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
  //
  // specs/014 US4 (AUDIT-20260609-19): the apply set IS the flips set — the
  // dampener decision carries each flip's located status line, and apply
  // consumes exactly that set. The old findFindingsByStatus re-walk keyed
  // independently and could migrate a same-id entry in a DIFFERENT section,
  // leaving the decided flip silently open behind an exit-0 apply.
  if (opts.apply) {
    const findings = res.flips.map((f) => ({
      findingId: f.findingId,
      fullFindingId: f.fullFindingId,
      severity: f.severity,
      statusLineIndex: f.statusLineIndex,
      title: f.title,
    }));
    // specs/installation-isolation US4 (TASK-40 class): the backlog
    // DESTINATION threads the same resolved installation the audit-log
    // target used — one anchor for both halves of the operation; the cwd
    // never re-decides where the migrated items land.
    const backend = createBacklogBackend({ cwd: backlogRoot(repoRoot) });
    let mig: ReturnType<typeof migrateFindings>;
    try {
      mig = migrateFindings({
        auditLogText: text,
        findings,
        backend,
        featureSlug: opts.feature,
        expectedStatusRe: STATUS_OPEN_RE,
      });
    } catch (err) {
      process.stderr.write(`slush-findings: FATAL — ${errorMessage(err)}\n`);
      process.exit(1);
    }
    await atomicWriteFile(auditLogPath, mig.newAuditLogText);
    // AUDIT-20260611-02: surface BOTH counts — a flip whose ref already exists
    // (same canonical id migrated earlier from another section) creates no new
    // item but its status is rewritten to the existing task id. Dry-run N ≡
    // migrated + already-present N on an unchanged audit-log.
    const alreadyPresent =
      mig.skipped.length > 0
        ? ` (${mig.skipped.length} already present: ${mig.skipped
            .map((s) => `${s.findingId}→${s.taskId}`)
            .join(', ')})`
        : '';
    process.stdout.write(
      `slush-findings: APPLIED — migrated ${mig.migrated.length} finding(s) to the backlog: ${mig.migrated
        .map((m) => `${m.findingId}→${m.taskId}`)
        .join(', ')}${alreadyPresent}\n`,
    );
  } else {
    process.stdout.write(
      `slush-findings: DRY-RUN — would migrate ${ids.length} finding(s) to the backlog: ${ids.join(', ')} (pass --apply to write)\n`,
    );
  }
  process.exit(0);
}
