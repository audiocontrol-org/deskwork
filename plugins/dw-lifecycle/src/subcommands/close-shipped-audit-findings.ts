/**
 * plugins/dw-lifecycle/src/subcommands/close-shipped-audit-findings.ts
 *
 * Phase 13 Task 4 Step 1 — verified-<date> automation CLI verb.
 *
 *   dw-lifecycle close-shipped-audit-findings
 *     --feature <slug>
 *     --from <ref>                 release-start ref (tag or sha)
 *     [--to <ref>]                 default HEAD
 *     [--date <YYYY-MM-DD>]        default today (UTC)
 *     [--repo-root <path>]
 *     [--apply]                    default dry-run
 *     [--help]
 *
 * Walks `git rev-list <from>..<to>` to get full SHAs in range, parses
 * the feature's audit-log, proposes flipping any `Status: fixed-<sha>`
 * entry whose `<sha>` is in range to `Status: verified-<date>`. Default
 * mode is dry-run per the project closure rule.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  AuditLogEditError,
  flipAuditLogStatus,
} from '../scope-discovery/promote-findings/audit-log-editor.js';
import {
  isFixedStatus,
  proposeVerifiedFlips,
  type VerifiedFlip,
} from '../scope-discovery/promote-findings/close-shipped-audit-findings.js';
import { parseAuditLogFile } from '../scope-discovery/util/audit-log-parser.js';

export interface CloseShippedAuditFindingsCliOptions {
  readonly featureSlug: string;
  readonly fromRef?: string;
  readonly toRef?: string;
  readonly date?: string;
  readonly repoRoot?: string;
  readonly apply?: boolean;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: CloseShippedAuditFindingsCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle close-shipped-audit-findings',
  '    --feature <slug>',
  '    --from <ref>',
  '    [--to <ref>]',
  '    [--date <YYYY-MM-DD>]',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--help]',
  '',
  '--feature <slug>      Required. Resolves the audit-log path.',
  '--from <ref>          Required. Release-range start (tag or SHA).',
  '--to <ref>            Release-range end. Default: HEAD.',
  '--date <YYYY-MM-DD>   Verification date. Default: today (UTC).',
  '--apply               Perform the writes. Default is dry-run.',
  '',
  'Per the project rule "Issue closure requires verification in a',
  'formally-installed release", the verb defaults to dry-run. Operators',
  'review the proposed verified-<date> candidates, confirm the release',
  'has been installed and walked, then re-run with --apply.',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let fromRef: string | undefined;
  let toRef: string | undefined;
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
      flag === '--from' ||
      flag === '--to' ||
      flag === '--date' ||
      flag === '--repo-root'
    ) {
      const value = argv[++i];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--from') fromRef = value;
      else if (flag === '--to') toRef = value;
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
  if (fromRef === undefined) {
    return { ok: false, error: '--from <ref> is required' };
  }
  const opts: CloseShippedAuditFindingsCliOptions = {
    featureSlug,
    fromRef,
    apply,
    ...(toRef !== undefined ? { toRef } : {}),
    ...(date !== undefined ? { date } : {}),
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

export interface ShaWalker {
  (args: { from: string; to: string; repoRoot: string }):
    | ReadonlyArray<string>
    | Promise<ReadonlyArray<string>>;
}

function defaultShaWalker(args: {
  from: string;
  to: string;
  repoRoot: string;
}): ReadonlyArray<string> {
  const raw = execFileSync(
    'git',
    ['-C', args.repoRoot, 'rev-list', `${args.from}..${args.to}`],
    { encoding: 'utf8' },
  );
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0');
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = now.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface RunArgs {
  readonly opts: CloseShippedAuditFindingsCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly shaWalker?: ShaWalker;
  readonly read?: (path: string) => Promise<string>;
  readonly write?: (path: string, content: string) => Promise<void>;
}

export async function runCloseShippedAuditFindings(
  args: RunArgs,
): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const featureRoot = await resolveFeatureRoot(
    repoRootResolved,
    args.opts.featureSlug,
  );
  if (featureRoot === null) {
    args.stderr.write(
      `close-shipped-audit-findings: feature '${args.opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    args.stderr.write(
      `close-shipped-audit-findings: audit-log not found at ${auditLogPath}.\n`,
    );
    return 2;
  }

  const fromRef = args.opts.fromRef;
  if (fromRef === undefined) {
    args.stderr.write(`close-shipped-audit-findings: --from is required.\n`);
    return 2;
  }
  const toRef = args.opts.toRef ?? 'HEAD';
  const date = args.opts.date ?? todayUtc();

  const walker = args.shaWalker ?? defaultShaWalker;
  let shasInRange: ReadonlyArray<string>;
  try {
    shasInRange = await walker({
      from: fromRef,
      to: toRef,
      repoRoot: repoRootResolved,
    });
  } catch (err) {
    args.stderr.write(
      `close-shipped-audit-findings: git rev-list failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const auditLog = await parseAuditLogFile(auditLogPath);
  const entriesView = auditLog.entries.map((e) => ({
    findingId: e.findingId,
    status: e.status,
    heading: e.heading,
  }));

  let proposals: ReadonlyArray<VerifiedFlip>;
  try {
    proposals = proposeVerifiedFlips({
      entries: entriesView,
      shasInRange,
      date,
    });
  } catch (err) {
    args.stderr.write(
      `close-shipped-audit-findings: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  args.stderr.write(
    `close-shipped-audit-findings: scanned ${shasInRange.length} commit(s) in ${fromRef}..${toRef}; found ${proposals.length} fixed-<sha> entries with SHA in range.\n`,
  );

  for (const flip of proposals) {
    args.stdout.write(
      `  ${flip.previousStatus} → ${flip.newStatus}  ${flip.findingId}\n`,
    );
  }

  if (args.opts.apply !== true) {
    args.stderr.write(
      `close-shipped-audit-findings: dry-run (re-run with --apply to write).\n`,
    );
    return 0;
  }

  if (proposals.length === 0) {
    args.stderr.write(
      `close-shipped-audit-findings: no proposals; nothing to apply.\n`,
    );
    return 0;
  }

  const reader = args.read ?? ((p: string) => readFile(p, 'utf8'));
  const writer =
    args.write ?? ((p: string, c: string) => writeFile(p, c, 'utf8'));

  try {
    const result = await flipAuditLogStatus({
      auditLogPath,
      flips: proposals.map((p) => ({
        findingId: p.findingId,
        newStatus: p.newStatus,
      })),
      read: reader,
      currentStatusPredicate: isFixedStatus,
    });
    await writer(auditLogPath, result.newContent);
    args.stderr.write(
      `close-shipped-audit-findings: ${proposals.length} flip(s) written to ${auditLogPath}.\n`,
    );
  } catch (err) {
    if (err instanceof AuditLogEditError) {
      args.stderr.write(`close-shipped-audit-findings: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
  return 0;
}

export async function closeShippedAuditFindingsCli(
  rawArgs: string[],
): Promise<void> {
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
  const exit = await runCloseShippedAuditFindings({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (exit !== 0) process.exit(exit);
}
