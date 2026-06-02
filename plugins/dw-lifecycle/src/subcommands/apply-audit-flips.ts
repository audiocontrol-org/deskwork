/**
 * plugins/dw-lifecycle/src/subcommands/apply-audit-flips.ts
 *
 * Phase 13 Task 4 Step 2 — closure-side automation CLI verb.
 *
 *   dw-lifecycle apply-audit-flips
 *     --feature <slug>
 *     [--since <ref>]           default: origin/main
 *     [--commit <sha>]          alternative to --since (scan one commit)
 *     [--repo-root <path>]
 *     [--apply]                 default is dry-run
 *     [--help]
 *
 * Walks commits in `<since>..HEAD` (or just `<sha>` when `--commit`
 * is supplied), parses `Closes AUDIT-<id>` and `Closes: AUDIT-X,
 * AUDIT-Y` references out of each commit's message, and proposes to
 * flip the matching audit-log entries from `Status: open` to
 * `Status: fixed-<sha>` (the sha attributed to each entry is the FIRST
 * commit in the range that cited it).
 *
 * Findings that are already non-`open` are reported as "already
 * dispositioned, skipping" and do not cause a failure.
 *
 * Default mode is dry-run (no writes). `--apply` performs the writes.
 * Exit codes:
 *   0 — proposals reported (or applied) cleanly.
 *   2 — config / argv error (missing --feature, feature root not found,
 *       git invocation failure).
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import {
  AuditLogEditError,
  flipAuditLogStatus,
  type StatusFlip,
} from '../scope-discovery/promote-findings/audit-log-editor.js';
import {
  proposeFlipsForCommits,
  type CommitInput,
  type ProposedFlip,
} from '../scope-discovery/promote-findings/auto-flip-from-commit.js';
import { parseAuditLogFile } from '../scope-discovery/util/audit-log-parser.js';

export interface ApplyAuditFlipsCliOptions {
  readonly featureSlug: string;
  readonly sinceRef?: string;
  readonly commitSha?: string;
  readonly repoRoot?: string;
  readonly apply?: boolean;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: ApplyAuditFlipsCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle apply-audit-flips',
  '    --feature <slug>',
  '    [--since <ref>]',
  '    [--commit <sha>]',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--help]',
  '',
  '--feature <slug>      Required. Resolves the audit-log at',
  '                      docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md.',
  '--since <ref>         Walk commits in <ref>..HEAD. Default: origin/main.',
  '--commit <sha>        Alternative to --since: scan exactly one commit.',
  '--repo-root <path>    Project root. Default: cwd.',
  '--apply               Perform the audit-log writes. Default is dry-run.',
  '',
  'Exit codes:',
  '  0  proposals reported (or applied) cleanly',
  '  2  config error (missing --feature, feature not found, git failure)',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let sinceRef: string | undefined;
  let commitSha: string | undefined;
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
      flag === '--since' ||
      flag === '--commit' ||
      flag === '--repo-root'
    ) {
      const value = argv[++i];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--since') sinceRef = value;
      else if (flag === '--commit') commitSha = value;
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
  if (sinceRef !== undefined && commitSha !== undefined) {
    return {
      ok: false,
      error: '--since and --commit are mutually exclusive',
    };
  }
  const opts: ApplyAuditFlipsCliOptions = {
    featureSlug,
    apply,
    ...(sinceRef !== undefined ? { sinceRef } : {}),
    ...(commitSha !== undefined ? { commitSha } : {}),
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

export interface CommitWalker {
  (args: { since?: string; commit?: string; repoRoot: string }):
    | ReadonlyArray<CommitInput>
    | Promise<ReadonlyArray<CommitInput>>;
}


function defaultCommitWalker(args: {
  since?: string;
  commit?: string;
  repoRoot: string;
}): ReadonlyArray<CommitInput> {
  if (args.commit !== undefined) {
    const message = execFileSync(
      'git',
      ['-C', args.repoRoot, 'log', '-1', '--format=%H%n%B', args.commit],
      { encoding: 'utf8' },
    );
    const [sha, ...bodyLines] = message.split('\n');
    if (sha === undefined) return [];
    return [{ sha, message: bodyLines.join('\n').trimEnd() }];
  }
  const since = args.since ?? 'origin/main';
  let raw: string;
  try {
    raw = execFileSync(
      'git',
      [
        '-C',
        args.repoRoot,
        'log',
        '-z',
        '--reverse',
        `${since}..HEAD`,
        '--format=%H%n%B',
      ],
      { encoding: 'utf8' },
    );
  } catch (err) {
    throw new Error(
      `apply-audit-flips: git log failed for range ${since}..HEAD: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return parseCommitsFromGitLog(raw);
}

/**
 * For each disposition flip (`fixed-<sha>` / `acknowledged-*` / `verified-*`
 * / `informational`), locate the matching workplan fix-finding task
 * (heading carries `(fix-finding-<canonical-id>)`) and reconcile its
 * checkboxes with the audit-log Status:
 *
 * - **`fixed-<sha>` (per AUDIT-20260530-14)**: tick only the closure-criterion
 *   line. The Steps 1-5 + other ACs were walked by the implementer; only
 *   the closure-criterion was waiting on the audit-log flip.
 *
 * - **`acknowledged-*` / `verified-*` / `informational` (the orphan-sweep
 *   path)**: the finding was dispositioned via a different path (bulk
 *   acknowledge, direct audit-log edit) without anyone walking the
 *   workplan task. The block is a SUPERSEDED orphan: tick all checkboxes
 *   AND insert a one-line supersession annotation after the heading.
 *   This sweeps the 2026-06-01 v0.31.2-on-PATH bulk-dispose backlog and
 *   prevents recurrence going forward.
 *
 * Best-effort: the regex anchors on the canonical AUDIT-id, so both
 * the renderer-shape clean marker and the cross-model nested-paren
 * variant match. Tasks not found in the workplan (e.g. the operator
 * deleted the task block, or the finding was closed without ever
 * being scoped) are silently skipped.
 */
function tickClosureCriteria(
  workplanText: string,
  flips: readonly StatusFlip[],
): string {
  const canonicalAuditId = (id: string): string =>
    /\bAUDIT-\d{8}-\d+/.exec(id)?.[0] ?? id;
  let updated = workplanText;
  for (const flip of flips) {
    const canonical = canonicalAuditId(flip.findingId);
    // Find the task heading line containing the canonical marker.
    const headingRe = new RegExp(
      `^(###\\s+Task\\s+[^\\n]*?fix-finding-${escapeRegExp(canonical)}\\b[^\\n]*:.*)$`,
      'mi',
    );
    const headingMatch = headingRe.exec(updated);
    if (headingMatch === null || headingMatch.index === undefined) continue;
    const headingEnd = headingMatch.index + headingMatch[0].length;
    // Find the end of this task block (next `### ` or `## ` heading,
    // or EOF).
    const tail = updated.slice(headingEnd);
    const nextHeadingRe = /\n(###\s|##\s)/m;
    const nextHeadingMatch = nextHeadingRe.exec(tail);
    const blockEnd =
      nextHeadingMatch !== null && nextHeadingMatch.index !== undefined
        ? headingEnd + nextHeadingMatch.index
        : updated.length;
    const block = updated.slice(headingEnd, blockEnd);

    const isFixedFlip = flip.newStatus.startsWith('fixed-');
    let newBlock: string;
    if (isFixedFlip) {
      // Tick only the closure-criterion line; Steps were walked.
      newBlock = block.replace(
        /- \[ \](\s+Audit-log Status flipped to `fixed-)/,
        '- [x]$1',
      );
    } else {
      // Orphan-sweep: tick ALL unchecked boxes in the block AND inject
      // a one-line supersession annotation directly after the heading
      // (idempotent — skip if the annotation is already there).
      const annotationLine = `\n\n> Superseded by audit-log Status \`${flip.newStatus}\` — no TDD walk required.`;
      const tickedBoxes = block.replace(/- \[ \]/g, '- [x]');
      newBlock = block.includes('> Superseded by audit-log Status')
        ? tickedBoxes
        : `${annotationLine}${tickedBoxes}`;
    }
    if (newBlock !== block) {
      updated = updated.slice(0, headingEnd) + newBlock + updated.slice(blockEnd);
    }
  }
  return updated;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCommitsFromGitLog(raw: string): ReadonlyArray<CommitInput> {
  const chunks = raw.split('\0');
  const out: CommitInput[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.replace(/^\n+/, '').replace(/\n+$/, '');
    if (trimmed.length === 0) continue;
    const newlineIdx = trimmed.indexOf('\n');
    if (newlineIdx === -1) {
      out.push({ sha: trimmed, message: '' });
      continue;
    }
    out.push({
      sha: trimmed.slice(0, newlineIdx),
      message: trimmed.slice(newlineIdx + 1),
    });
  }
  return out;
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

export interface ApplyAuditFlipsReport {
  readonly proposals: readonly ProposedFlip[];
  readonly actionable: readonly StatusFlip[];
  readonly alreadyDispositioned: readonly {
    findingId: string;
    currentStatus: string;
  }[];
  readonly unknownIds: readonly string[];
  readonly written: boolean;
  readonly auditLogPath: string;
}

export interface RunArgs {
  readonly opts: ApplyAuditFlipsCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly commitWalker?: CommitWalker;
  readonly read?: (path: string) => Promise<string>;
  readonly write?: (path: string, content: string) => Promise<void>;
}

export async function runApplyAuditFlips(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const featureRoot = await resolveFeatureRoot(
    repoRootResolved,
    args.opts.featureSlug,
  );
  if (featureRoot === null) {
    args.stderr.write(
      `apply-audit-flips: feature '${args.opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  if (!existsSync(auditLogPath)) {
    args.stderr.write(
      `apply-audit-flips: audit-log not found at ${auditLogPath}.\n`,
    );
    return 2;
  }
  const walker = args.commitWalker ?? defaultCommitWalker;
  let commits: ReadonlyArray<CommitInput>;
  try {
    commits = await walker({
      ...(args.opts.sinceRef !== undefined ? { since: args.opts.sinceRef } : {}),
      ...(args.opts.commitSha !== undefined
        ? { commit: args.opts.commitSha }
        : {}),
      repoRoot: repoRootResolved,
    });
  } catch (err) {
    args.stderr.write(
      `apply-audit-flips: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  const proposals = proposeFlipsForCommits(commits);
  if (proposals.length === 0 && args.opts.apply !== true) {
    // Dry-run with no proposals: nothing to report; bail out early.
    // With --apply, fall through — the orphan-sweep step (below) can
    // still tick workplan blocks against already-terminal audit-log
    // entries even when no commit cites them.
    args.stderr.write(
      `apply-audit-flips: no Closes-AUDIT references in scanned commits; nothing to do.\n`,
    );
    return 0;
  }

  const reader = args.read ?? ((p: string) => readFile(p, 'utf8'));
  const writer =
    args.write ?? ((p: string, c: string) => writeFile(p, c, 'utf8'));

  const auditLog = await parseAuditLogFile(auditLogPath);
  const currentStatusById = new Map<string, string>();
  for (const entry of auditLog.entries) {
    // Per AUDIT-20260530-07 / -08-equivalent: cross-model audit-log
    // entries carry their Finding-ID with a trailing `(claude-X +
    // codex-Y; cross-model)` annotation. The auto-flip proposal's
    // findingId (parsed from `Closes AUDIT-NNNNNNNN-NN` in the
    // commit subject) is canonical. Index the map by the canonical
    // form on both sides so the lookup succeeds for cross-model
    // findings too.
    const canonical = /AUDIT-\d{8}-\d+/.exec(entry.findingId)?.[0] ?? entry.findingId;
    currentStatusById.set(canonical, entry.status);
  }

  const actionable: StatusFlip[] = [];
  const alreadyDispositioned: { findingId: string; currentStatus: string }[] = [];
  const unknownIds: string[] = [];

  for (const proposal of proposals) {
    const current = currentStatusById.get(proposal.findingId);
    if (current === undefined) {
      unknownIds.push(proposal.findingId);
      continue;
    }
    if (current !== 'open') {
      alreadyDispositioned.push({
        findingId: proposal.findingId,
        currentStatus: current,
      });
      continue;
    }
    actionable.push(proposal);
  }

  args.stderr.write(
    `apply-audit-flips: scanned ${commits.length} commit(s), found ${proposals.length} Closes-AUDIT reference(s). ` +
      `Actionable: ${actionable.length}; already-dispositioned: ${alreadyDispositioned.length}; unknown-ids: ${unknownIds.length}.\n`,
  );

  for (const flip of actionable) {
    args.stdout.write(
      `  open → ${flip.newStatus}  ${flip.findingId}\n`,
    );
  }
  for (const entry of alreadyDispositioned) {
    args.stdout.write(
      `  skip  (already ${entry.currentStatus})  ${entry.findingId}\n`,
    );
  }
  for (const id of unknownIds) {
    args.stdout.write(`  skip  (no such Finding-ID in audit-log)  ${id}\n`);
  }

  let written = false;
  if (args.opts.apply === true && actionable.length > 0) {
    try {
      const result = await flipAuditLogStatus({
        auditLogPath,
        flips: actionable,
        read: reader,
      });
      await writer(auditLogPath, result.newContent);
      written = true;
      args.stderr.write(
        `apply-audit-flips: ${actionable.length} flip(s) written to ${auditLogPath}.\n`,
      );
    } catch (err) {
      if (err instanceof AuditLogEditError) {
        args.stderr.write(`apply-audit-flips: ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  } else if (args.opts.apply !== true) {
    args.stderr.write(
      `apply-audit-flips: dry-run (re-run with --apply to write).\n`,
    );
  }

  // Per AUDIT-20260530-14: ALSO tick the workplan closure-criterion
  // checkbox for every finding the audit-log shows as fixed-<sha>
  // — both newly-actionable flips (this run) AND already-dispositioned
  // entries (prior runs). The gate's findUncheckedTasksInOrder treats
  // any task with a `- [ ]` checkbox as unchecked, so a previously-
  // flipped audit-log entry whose workplan checkbox stayed `- [ ]`
  // keeps the task looking unfinished forever. Catch up on every
  // --apply run.
  if (args.opts.apply === true) {
    // Catch up the workplan for EVERY terminal disposition in the
    // audit-log, not just the findings cited by recent commits.
    //
    // The pre-fix filter included only `alreadyDispositioned` entries
    // (findings cited by `Closes <id>` commits whose status is
    // already-terminal). That covered the "task walked + committed but
    // audit-log not flipped" path, but missed orphan entries — findings
    // dispositioned via bulk-acknowledge or direct audit-log edits,
    // never cited by any commit (the 2026-06-01 v0.31.2-on-PATH 57-orphan
    // backlog). Walk the whole audit-log to catch those too.
    //
    // Terminal statuses: `fixed-<sha>` (real fix), `acknowledged-*`
    // (operator-judged closure), `verified-*` (post-release confirmation),
    // `informational` (positive-signal observation).
    // `tickClosureCriteria` distinguishes the two outcomes: `fixed-`
    // ticks the closure-criterion only (Steps were walked);
    // anything else marks the block superseded (orphan: tick all + annotate).
    const isTerminal = (status: string): boolean =>
      status.startsWith('fixed-') ||
      status.startsWith('acknowledged-') ||
      status.startsWith('verified-') ||
      status === 'informational';
    const allTerminalFromLog: readonly StatusFlip[] = auditLog.entries
      .filter((e) => isTerminal(e.status))
      .map((e) => ({ findingId: e.findingId, newStatus: e.status }));
    // Dedupe: prefer `actionable` (just-applied flips with their final
    // SHA) over log-walked entries (which may carry the same SHA but
    // could differ in cross-model annotation).
    const seenIds = new Set(
      actionable.map(
        (a) => /AUDIT-\d{8}-\d+/.exec(a.findingId)?.[0] ?? a.findingId,
      ),
    );
    const allFixed: readonly StatusFlip[] = [
      ...actionable,
      ...allTerminalFromLog.filter((e) => {
        const canonical =
          /AUDIT-\d{8}-\d+/.exec(e.findingId)?.[0] ?? e.findingId;
        if (seenIds.has(canonical)) return false;
        seenIds.add(canonical);
        return true;
      }),
    ];
    if (allFixed.length > 0) {
      const workplanPath = join(featureRoot, 'workplan.md');
      if (existsSync(workplanPath)) {
        try {
          const wpBefore = await reader(workplanPath);
          const wpAfter = tickClosureCriteria(wpBefore, allFixed);
          if (wpAfter !== wpBefore) {
            await writer(workplanPath, wpAfter);
            args.stderr.write(
              `apply-audit-flips: closure-criterion checkbox(es) flipped in ${workplanPath}.\n`,
            );
          }
        } catch (wpErr) {
          // Per AUDIT-20260530-17: the workplan-side flip is now a
          // HARD requirement on --apply. Pre-fix this was best-effort
          // with a warning, which preserved the AUDIT-14 failure mode:
          // audit-log says fixed, workplan checkbox stays `- [ ]`,
          // gate keeps treating the task as unchecked. Hard-exit so
          // the operator sees the split-state and can fix it.
          args.stderr.write(
            `apply-audit-flips: workplan-side write FAILED at ${workplanPath}: ` +
              `${wpErr instanceof Error ? wpErr.message : String(wpErr)}.\n` +
              `  The audit-log was already written; state is split ` +
              `(audit-log shows fixed-<sha>; workplan checkbox still \`- [ ]\`). ` +
              `Manually flip the workplan checkbox for each fixed finding, ` +
              `then re-run apply-audit-flips to confirm the catchup is idempotent.\n`,
          );
          return 1;
        }
      }
    }
  }

  const report: ApplyAuditFlipsReport = {
    proposals,
    actionable,
    alreadyDispositioned,
    unknownIds,
    written,
    auditLogPath,
  };
  void report;
  return 0;
}

export async function applyAuditFlipsCli(rawArgs: string[]): Promise<void> {
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
  const exit = await runApplyAuditFlips({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (exit !== 0) process.exit(exit);
}
