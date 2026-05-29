/**
 * plugins/dw-lifecycle/src/subcommands/re-audit-fixed-findings.ts
 *
 * Phase 13 Task 4 Step 3 — CLI verb backing `/dw-lifecycle:re-audit-fixed-findings`.
 *
 *   dw-lifecycle re-audit-fixed-findings
 *     --feature <slug>
 *     --run-dir <path>             audit-runs/<ts>-<feature>/
 *     [--date <YYYY-MM-DD>]
 *     [--repo-root <path>]
 *     [--apply]
 *     [--help]
 *
 * For each audit-log entry with `Status: fixed-<sha>`:
 *   - If the new barrage run text contains the entry's heading or
 *     Surface field path tokens → STILL SURFACED. Status stays
 *     `fixed-<sha>`; surface to operator for in-place body append.
 *   - If the new run text has neither → NOT SURFACED. Propose
 *     `verified-<date>` flip.
 *   - If the entry has no usable heading/surface to match against →
 *     UNMATCHABLE. Operator triage.
 *
 * Default mode is dry-run. `--apply` writes verified-<date> flips for
 * the not-surfaced bucket only; re-surfaced + unmatchable entries are
 * always reported and never auto-mutated.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  AuditLogEditError,
  flipAuditLogStatus,
} from '../scope-discovery/promote-findings/audit-log-editor.js';
import {
  crossReferenceAuditRun,
  type CrossReferenceResult,
} from '../scope-discovery/promote-findings/cross-reference-audit-run.js';
import { isFixedStatus } from '../scope-discovery/promote-findings/close-shipped-audit-findings.js';
import { parseAuditLogFile } from '../scope-discovery/util/audit-log-parser.js';

void execSync; // silence unused-import warning when not yet wired

export interface ReAuditFixedFindingsCliOptions {
  readonly featureSlug: string;
  readonly runDir?: string;
  readonly date?: string;
  readonly repoRoot?: string;
  readonly apply?: boolean;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: ReAuditFixedFindingsCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle re-audit-fixed-findings',
  '    --feature <slug>',
  '    --run-dir <path>',
  '    [--date <YYYY-MM-DD>]',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--help]',
  '',
  '--feature <slug>      Required. Resolves the audit-log path.',
  '--run-dir <path>      Required. Audit-barrage run dir to cross-reference.',
  '--date <YYYY-MM-DD>   verified-<date> suffix; default today (UTC).',
  '--apply               Writes verified-<date> flips. Default dry-run.',
  '',
  'Workflow:',
  '  1. Fire `dw-lifecycle audit-barrage` against the feature.',
  '  2. Point this verb at the new audit-runs/<ts>-<slug>/ directory.',
  '  3. Review the candidates: not-surfaced -> verified-<date>;',
  '     still-surfaced -> fix did not actually fix (operator triage);',
  '     unmatchable -> operator must classify by hand.',
  '  4. Re-run with --apply to flip the not-surfaced candidates.',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let runDir: string | undefined;
  let date: string | undefined;
  let repoRootOverride: string | undefined;
  let apply = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--apply') {
      apply = true;
      continue;
    }
    if (
      flag === '--feature' ||
      flag === '--run-dir' ||
      flag === '--date' ||
      flag === '--repo-root'
    ) {
      const value = argv[++i];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--run-dir') runDir = value;
      else if (flag === '--date') date = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return {
      ok: true,
      opts: { help: true, featureSlug: featureSlug ?? '' },
    };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  if (runDir === undefined) {
    return { ok: false, error: '--run-dir <path> is required' };
  }
  const opts: ReAuditFixedFindingsCliOptions = {
    featureSlug,
    runDir,
    apply,
    ...(date !== undefined ? { date } : {}),
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

async function resolveFeatureRoot(
  rootDir: string,
  slug: string,
): Promise<string | null> {
  const docsRoot = join(rootDir, 'docs');
  if (!existsSync(docsRoot)) return null;
  const topEntries = await readdir(docsRoot);
  for (const version of topEntries) {
    const inProgress = join(docsRoot, version, '001-IN-PROGRESS');
    if (!existsSync(inProgress)) continue;
    const featureDir = join(inProgress, slug);
    if (existsSync(featureDir)) return featureDir;
  }
  return null;
}

function todayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear().toString().padStart(4, '0');
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function readRunDirText(runDir: string): Promise<string> {
  const entries = await readdir(runDir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    const path = join(runDir, entry.name);
    const text = await readFile(path, 'utf8');
    out.push(text);
  }
  return out.join('\n\n');
}

export interface RunArgs {
  readonly opts: ReAuditFixedFindingsCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly read?: (path: string) => Promise<string>;
  readonly write?: (path: string, content: string) => Promise<void>;
  readonly runDirReader?: (runDir: string) => Promise<string>;
}

export async function runReAuditFixedFindings(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const featureRoot = await resolveFeatureRoot(
    repoRootResolved,
    args.opts.featureSlug,
  );
  if (featureRoot === null) {
    args.stderr.write(
      `re-audit-fixed-findings: feature '${args.opts.featureSlug}' not found.\n`,
    );
    return 2;
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    args.stderr.write(
      `re-audit-fixed-findings: audit-log not found at ${auditLogPath}.\n`,
    );
    return 2;
  }
  const runDir = args.opts.runDir;
  if (runDir === undefined) {
    args.stderr.write(`re-audit-fixed-findings: --run-dir required.\n`);
    return 2;
  }
  const runDirResolved = isAbsolute(runDir)
    ? runDir
    : resolve(repoRootResolved, runDir);
  if (!existsSync(runDirResolved)) {
    args.stderr.write(
      `re-audit-fixed-findings: run-dir not found at ${runDirResolved}.\n`,
    );
    return 2;
  }
  const date = args.opts.date ?? todayUtc();

  const newRunText = await (args.runDirReader ?? readRunDirText)(
    runDirResolved,
  );
  if (newRunText.length === 0) {
    args.stderr.write(
      `re-audit-fixed-findings: run-dir contains no .md outputs to cross-reference.\n`,
    );
    return 2;
  }

  const auditLog = await parseAuditLogFile(auditLogPath);
  const fixedEntries = auditLog.entries
    .filter((e) => isFixedStatus(e.status))
    .map((e) => ({
      findingId: e.findingId,
      status: e.status,
      ...(e.heading !== undefined ? { heading: e.heading } : {}),
      ...(e.surface !== undefined ? { surface: e.surface } : {}),
    }));

  const results: ReadonlyArray<CrossReferenceResult> = crossReferenceAuditRun({
    fixedEntries,
    newRunText,
  });

  const notSurfaced = results.filter((r) => r.classification === 'not-surfaced');
  const stillSurfaced = results.filter((r) => r.classification === 'still-surfaced');
  const unmatchable = results.filter((r) => r.classification === 'unmatchable');

  args.stderr.write(
    `re-audit-fixed-findings: ${fixedEntries.length} fixed-<sha> entries cross-referenced. ` +
      `not-surfaced=${notSurfaced.length}; still-surfaced=${stillSurfaced.length}; unmatchable=${unmatchable.length}.\n`,
  );

  for (const r of notSurfaced) {
    args.stdout.write(
      `  flip → verified-${date}  ${r.findingId}  (no heading/surface match in new run)\n`,
    );
  }
  for (const r of stillSurfaced) {
    args.stdout.write(
      `  RE-SURFACED  ${r.findingId}  matched by [${r.matchedBy.join(', ')}] — fix did NOT actually fix; operator triage\n`,
    );
  }
  for (const r of unmatchable) {
    args.stdout.write(
      `  unmatchable  ${r.findingId}  (no usable heading or Surface field) — operator must classify by hand\n`,
    );
  }

  if (args.opts.apply !== true) {
    args.stderr.write(
      `re-audit-fixed-findings: dry-run (re-run with --apply to write verified-<date> flips for the ${notSurfaced.length} not-surfaced candidate(s)).\n`,
    );
    return 0;
  }

  if (notSurfaced.length === 0) {
    args.stderr.write(
      `re-audit-fixed-findings: no not-surfaced candidates to flip.\n`,
    );
    return 0;
  }

  const reader = args.read ?? ((p: string) => readFile(p, 'utf8'));
  const writer =
    args.write ?? ((p: string, c: string) => writeFile(p, c, 'utf8'));

  try {
    const result = await flipAuditLogStatus({
      auditLogPath,
      flips: notSurfaced.map((r) => ({
        findingId: r.findingId,
        newStatus: `verified-${date}`,
      })),
      read: reader,
      currentStatusPredicate: isFixedStatus,
    });
    await writer(auditLogPath, result.newContent);
    args.stderr.write(
      `re-audit-fixed-findings: ${notSurfaced.length} verified flip(s) written to ${auditLogPath}.\n`,
    );
  } catch (err) {
    if (err instanceof AuditLogEditError) {
      args.stderr.write(`re-audit-fixed-findings: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
  return 0;
}

export async function reAuditFixedFindingsCli(rawArgs: string[]): Promise<void> {
  const parsed = parseFlags(rawArgs);
  if (parsed.ok && parsed.opts.help === true) {
    process.stdout.write(USAGE);
    return;
  }
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${USAGE}`);
    process.exit(2);
  }
  let projectRoot: string;
  if (parsed.opts.repoRoot !== undefined) {
    projectRoot = isAbsolute(parsed.opts.repoRoot)
      ? parsed.opts.repoRoot
      : resolve(process.cwd(), parsed.opts.repoRoot);
  } else {
    projectRoot = repoRoot();
  }
  const exit = await runReAuditFixedFindings({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (exit !== 0) process.exit(exit);
}
