/**
 * plugins/dw-lifecycle/src/subcommands/implement-hook.ts
 *
 * Phase 17 Task 3 — single verb that wraps the entire audit-barrage
 * hook chain. The "no agent discretion" piece of the three-layer
 * mechanization.
 *
 *   dw-lifecycle implement-hook
 *     --feature <slug>
 *     [--repo-root <path>]
 *     [--help]
 *
 * Sequence:
 *   1. check-barrage-tip — new-diff guard. No new diff → marker
 *      written with disposition=no-new-diff-skip; exit 0.
 *   2. audit-barrage-render — produce the prompt.
 *   3. audit-barrage --output-run-dir — fire the parallel CLI fan-out.
 *   4. audit-barrage-lift --apply — extract findings to audit-log.
 *   5. check-barrage-dampener — branch on result.
 *   6. slush-remaining --apply OR promote-findings --auto — disposition.
 *   7. check-open-findings — sanity check.
 *   8. Write marker with disposition + counts.
 *
 * Exit codes:
 *   0 — hook ran cleanly (fired + dispositioned, OR no-new-diff skip).
 *   1 — hook failed mid-flight. Marker NOT written; the commit-msg
 *       gate will refuse the next commit until the operator re-runs
 *       this verb successfully.
 *   2 — config error (missing slug, feature root not found, etc.).
 *
 * The wrapper exists because the agent cannot be trusted to invoke
 * the 5-CLI bash composition reliably (proved 2026-05-31). Combined
 * with the commit-msg gate (`check-implement-hook-ran`) and pre-push
 * gate (`check-implement-hook-coverage`), the agent loses every form
 * of discretion at the hook-firing decision.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { checkBarrageDampener } from '../scope-discovery/promote-findings/check-barrage-dampener.js';
import {
  writeHookRunMarker,
  type HookDisposition,
  type HookRunMarker,
} from '../scope-discovery/promote-findings/hook-run-marker.js';
import { appendHookRunLogEntry } from '../scope-discovery/promote-findings/hook-run-log.js';
import {
  parseLiftFindingsCount,
  parseSlushCounts,
  parsePromoteCount,
} from './implement-hook-counters.js';
import {
  computeAuditedDiff,
  EMPTY_DIFF_CURE_MESSAGE,
} from '../scope-discovery/promote-findings/audited-diff.js';
import { checkAncestry } from '../scope-discovery/util/git-ancestry.js';

export interface ImplementHookCliOptions {
  readonly featureSlug: string;
  readonly repoRoot?: string;
  readonly help?: boolean;
}

export type ParseFlagsResult =
  | { readonly ok: true; readonly opts: ImplementHookCliOptions }
  | { readonly ok: false; readonly error: string };

const USAGE = [
  'Usage: dw-lifecycle implement-hook',
  '    --feature <slug>',
  '    [--repo-root <path>]',
  '    [--help]',
  '',
  '--feature <slug>   Required.',
  '--repo-root <path> Project root. Default: cwd.',
  '',
  'Exit codes:',
  '  0  hook ran cleanly (fired + dispositioned OR no-new-diff skip)',
  '  1  hook failed mid-flight (marker NOT written)',
  '  2  config error',
  '',
].join('\n');

export function parseFlags(argv: ReadonlyArray<string>): ParseFlagsResult {
  let featureSlug: string | undefined;
  let repoRootOverride: string | undefined;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--feature' || flag === '--repo-root') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${flag ?? '(undefined)'}` };
  }
  if (help) {
    return { ok: true, opts: { featureSlug: featureSlug ?? '', help: true } };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature <slug> is required' };
  }
  const opts: ImplementHookCliOptions = {
    featureSlug,
    ...(repoRootOverride !== undefined ? { repoRoot: repoRootOverride } : {}),
  };
  return { ok: true, opts };
}

function gitRevParseHead(repoRoot: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function gitLogSubjects(repoRoot: string, range: string): string {
  try {
    return execFileSync('git', ['log', '--format=%s', range], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

function gitDiff(repoRoot: string, range: string): string {
  try {
    return execFileSync('git', ['diff', range], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024, // 50MB for large diffs
    });
  } catch {
    return '';
  }
}

// Phase 22 Task 2 (#399 Friction 2): staged + unstaged diff helpers.
// `git diff --cached` shows index-vs-HEAD; `git diff` shows worktree-vs-index.
// Both are needed for the fallback chain when the commit range is empty.
function gitDiffCached(repoRoot: string): string {
  try {
    return execFileSync('git', ['diff', '--cached'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function gitDiffWorktree(repoRoot: string): string {
  try {
    return execFileSync('git', ['diff'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

// Per AUDIT-20260602-41/-42/-43: the ancestry helper is imported from
// scope-discovery/util/git-ancestry.ts. The shared implementation has
// the fail-closed semantic + a real-git integration test suite. Both
// CLI shims use it.

interface DwlVerbInvocation {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

function invokeDwl(args: ReadonlyArray<string>, repoRoot: string): DwlVerbInvocation {
  try {
    const stdout = execFileSync('dw-lifecycle', [...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString('utf8') ?? '',
      stderr: typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8') ?? '',
      status: e.status ?? 1,
    };
  }
}

export interface RunArgs {
  readonly opts: ImplementHookCliOptions;
  readonly projectRoot: string;
  readonly stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
}

export async function runImplementHook(args: RunArgs): Promise<number> {
  const repoRootResolved = args.opts.repoRoot ?? args.projectRoot;
  const { root: featureRoot } = await resolveFeatureRoot({
    repoRoot: repoRootResolved,
    slug: args.opts.featureSlug,
  });
  if (featureRoot === undefined) {
    args.stderr.write(
      `implement-hook: feature '${args.opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }

  // Step 1: new-diff guard.
  const tipCheck = invokeDwl(
    ['check-barrage-tip', '--feature', args.opts.featureSlug, '--repo-root', repoRootResolved],
    repoRootResolved,
  );
  if (tipCheck.status === 2) {
    args.stderr.write(`implement-hook: check-barrage-tip config error:\n${tipCheck.stderr}`);
    return 2;
  }
  args.stderr.write(tipCheck.stderr);
  if (tipCheck.status === 1) {
    // No new diff → write marker and exit.
    const head = gitRevParseHead(repoRootResolved);
    if (head === null) {
      args.stderr.write('implement-hook: git rev-parse HEAD failed; marker not written.\n');
      return 1;
    }
    const wrote = await writeMarkerSafe({
      repoRoot: repoRootResolved,
      tip: head,
      runDir: null,
      disposition: 'no-new-diff-skip',
      findingsCount: 0,
      promotedCount: 0,
      slushedCount: 0,
      stderr: args.stderr,
    });
    if (!wrote) {
      args.stderr.write('implement-hook: marker/log persistence failed on no-new-diff path; exit 1.\n');
      return 1;
    }
    args.stderr.write('implement-hook: no new diff since last barrage; skip without firing.\n');
    return 0;
  }

  // Steps 2-4: render → fire → lift.
  const auditLogPath = join(featureRoot, 'audit-log.md');
  const workplanPath = join(featureRoot, 'workplan.md');
  const head = gitRevParseHead(repoRootResolved);
  if (head === null) {
    args.stderr.write('implement-hook: git rev-parse HEAD failed; aborting.\n');
    return 1;
  }
  const rawBarrageTip = await readLatestBarrageTip(repoRootResolved);
  // Phase 22 Task 3 (#399 Friction 1): when the marker came back via
  // `git reset --hard origin/main` from a tracked main-side blob, its
  // tip points at a commit no longer reachable from HEAD. Walking
  // `lastBarrageTip..HEAD` would yield main's shipped history, not the
  // operator's new work. Detect divergence by checking ancestry and
  // fall through to the HEAD~10 fallback when the marker is from
  // another timeline.
  // Per AUDIT-20260602-45: implement-hook's safe direction on unknown
  // is to DROP the marker tip and fall back to the HEAD~10 baseline.
  // Walking a tip we can't verify could mean walking main's shipped
  // commits as "new diff" (Friction-1's exact pathology). Only trust
  // the marker when checkAncestry confirms `'ancestor'`. This is the
  // inverse safety mapping from check-implement-hook-ran's call site.
  const ancestry =
    rawBarrageTip !== null
      ? checkAncestry({ repoRoot: repoRootResolved, tip: rawBarrageTip })
      : 'unknown';
  const lastBarrageTip = ancestry === 'ancestor' ? rawBarrageTip : null;
  if (rawBarrageTip !== null && lastBarrageTip === null) {
    args.stderr.write(
      `implement-hook: barrage tip ${rawBarrageTip.slice(0, 8)} is not an ancestor of HEAD ` +
        `${head.slice(0, 8)} (history diverged via reset/rebase/sync). ` +
        `Falling back to HEAD~10 baseline per Phase 22 Task 3 (#399 Friction 1).\n`,
    );
  }
  const range = lastBarrageTip !== null ? `${lastBarrageTip}..${head}` : `HEAD~10..${head}`;
  // Phase 22 Task 2 (#399 Friction 2): the commit-range diff can be
  // empty in the immediate post-`git reset --hard origin/main` state
  // (HEAD has no novel commits over lastBarrageTip; operator's work is
  // staged-uncommitted). Fall back to staged → unstaged → empty so the
  // barrage either audits real work or refuses with a loud cure rather
  // than firing on a blank "Diff under audit" section.
  const auditedDiff = computeAuditedDiff({
    range,
    deps: {
      gitDiffRange: (r) => gitDiff(repoRootResolved, r),
      gitDiffCached: () => gitDiffCached(repoRootResolved),
      gitDiffWorktree: () => gitDiffWorktree(repoRootResolved),
    },
  });
  if (auditedDiff.source === 'empty') {
    args.stderr.write(`${EMPTY_DIFF_CURE_MESSAGE}\n`);
    return 1;
  }
  if (auditedDiff.source !== 'commit-range') {
    // Tell the operator which fallback we used so the diagnostic chain
    // is auditable post-hoc — relevant when reviewing a barrage that
    // produced findings from staged-but-uncommitted work.
    args.stderr.write(
      `implement-hook: commit range was empty; auditing ${auditedDiff.source} changes instead (per #399 Friction 2 fallback).\n`,
    );
  }
  const diff = auditedDiff.diff;
  const commitSubjects = gitLogSubjects(repoRootResolved, range);
  const workplanSummary = await tailFile(workplanPath, 60);
  const auditLogExcerpt = await tailFile(auditLogPath, 80);
  const varsPath = await writeVarsFile({
    featureSlug: args.opts.featureSlug,
    workplanSummary,
    diff,
    auditLogExcerpt,
    commitSubjects,
  });
  const promptPath = await reservePromptPath();

  const renderResult = invokeDwl(
    [
      'audit-barrage-render',
      '--feature',
      args.opts.featureSlug,
      '--vars-file',
      varsPath,
      '--output',
      promptPath,
      '--repo-root',
      repoRootResolved,
    ],
    repoRootResolved,
  );
  args.stderr.write(renderResult.stderr);
  if (renderResult.status !== 0) {
    args.stderr.write('implement-hook: audit-barrage-render failed; aborting.\n');
    return 1;
  }

  const fireResult = invokeDwl(
    [
      'audit-barrage',
      '--feature',
      args.opts.featureSlug,
      '--prompt-file',
      promptPath,
      '--output-run-dir',
      '--repo-root',
      repoRootResolved,
    ],
    repoRootResolved,
  );
  args.stderr.write(fireResult.stderr);
  const runDir = fireResult.stdout.trim();
  if (fireResult.status === 1) {
    // All models failed (spawn errors / zero bytes). The hook
    // forward-progresses per SKILL.md "barrage was an outage, NOT a
    // finding." Write marker with disposition=barrage-outage so the
    // gate still sees the verb ran.
    const wrote = await writeMarkerSafe({
      repoRoot: repoRootResolved,
      tip: head,
      runDir: runDir.length > 0 ? runDir : null,
      disposition: 'barrage-outage',
      findingsCount: 0,
      promotedCount: 0,
      slushedCount: 0,
      stderr: args.stderr,
    });
    if (!wrote) {
      args.stderr.write('implement-hook: marker/log persistence failed on outage path; exit 1.\n');
      return 1;
    }
    args.stderr.write(
      'implement-hook: audit-barrage all-models-failed (outage); marker written, hook complete.\n',
    );
    return 0;
  }
  if (fireResult.status !== 0 || runDir.length === 0) {
    args.stderr.write('implement-hook: audit-barrage failed unexpectedly; aborting.\n');
    return 1;
  }

  const liftResult = invokeDwl(
    [
      'audit-barrage-lift',
      '--feature',
      args.opts.featureSlug,
      '--run-dir',
      runDir,
      '--apply',
      '--repo-root',
      repoRootResolved,
    ],
    repoRootResolved,
  );
  args.stderr.write(liftResult.stderr);
  if (liftResult.status !== 0) {
    args.stderr.write('implement-hook: audit-barrage-lift failed; aborting.\n');
    return 1;
  }
  // Per GH #384 / AUDIT-20260601-18: the canonical findings count
  // comes from the lift's stderr ("extracted N finding(s)"), NOT
  // from the disposition step. Pre-fix, findingsCount was only set
  // inside the slush/promote branches, so even successful lifts
  // showed findings=0 when the regex didn't match.
  const findingsCountFromLift = parseLiftFindingsCount(liftResult.stderr);

  // Step 5: dampener.
  const auditLogText = await safeReadText(auditLogPath);
  const dampener = checkBarrageDampener({ auditLogText });
  args.stderr.write(`implement-hook: dampener result — ${dampener.reason}\n`);

  // Step 6: disposition branch.
  let disposition: HookDisposition;
  let findingsCount = findingsCountFromLift;
  let promotedCount = 0;
  let slushedCount = 0;

  if (dampener.dampened) {
    const slushResult = invokeDwl(
      [
        'slush-remaining',
        '--feature',
        args.opts.featureSlug,
        '--apply',
        '--repo-root',
        repoRootResolved,
      ],
      repoRootResolved,
    );
    args.stderr.write(slushResult.stderr);
    if (slushResult.status !== 0) {
      args.stderr.write('implement-hook: slush-remaining failed; aborting.\n');
      return 1;
    }
    disposition = 'fired-and-slushed';
    // Per GH #384: pull from the shared parser. slush-remaining
    // writes "flipped: N, skipped: M HIGH(s)" to stderr; the parser
    // returns null when not found. Caller maps null → 0.
    const slush = parseSlushCounts(slushResult.stderr);
    if (slush !== null) {
      slushedCount = slush.flipped;
    }
  } else {
    const promoteResult = invokeDwl(
      [
        'promote-findings',
        '--feature',
        args.opts.featureSlug,
        '--auto',
        '--repo-root',
        repoRootResolved,
      ],
      repoRootResolved,
    );
    args.stderr.write(promoteResult.stderr);
    if (promoteResult.status !== 0) {
      args.stderr.write('implement-hook: promote-findings failed; aborting.\n');
      return 1;
    }
    disposition = 'fired-and-promoted';
    // Per GH #384 / AUDIT-20260601-18: promote-findings writes
    // "Auto-applied: N finding(s)" to STDOUT (not stderr). Pre-fix
    // regex was "promoted: N" against stderr — wrong on both axes.
    promotedCount = parsePromoteCount(promoteResult.stdout);
  }

  // Step 7: sanity check.
  const gateResult = invokeDwl(
    [
      'check-open-findings',
      '--feature',
      args.opts.featureSlug,
      '--repo-root',
      repoRootResolved,
    ],
    repoRootResolved,
  );
  args.stderr.write(gateResult.stderr);
  if (gateResult.status !== 0) {
    args.stderr.write('implement-hook: check-open-findings refused after disposition; aborting.\n');
    return 1;
  }

  // Step 8: marker.
  const wrote = await writeMarkerSafe({
    repoRoot: repoRootResolved,
    tip: head,
    runDir,
    disposition,
    findingsCount,
    promotedCount,
    slushedCount,
    stderr: args.stderr,
  });
  if (!wrote) {
    args.stderr.write('implement-hook: marker/log persistence failed on happy path; exit 1.\n');
    return 1;
  }
  args.stderr.write(
    `implement-hook: complete (disposition=${disposition}, findings=${findingsCount}, promoted=${promotedCount}, slushed=${slushedCount}).\n`,
  );
  return 0;
}

interface MarkerWriteArgs {
  readonly repoRoot: string;
  readonly tip: string;
  readonly runDir: string | null;
  readonly disposition: HookDisposition;
  readonly findingsCount: number;
  readonly promotedCount: number;
  readonly slushedCount: number;
  readonly stderr: NodeJS.WriteStream | NodeJS.WritableStream;
}

/**
 * Per AUDIT-20260531-18: marker write failure or log append failure
 * MUST surface as a non-zero outcome. A successful-looking exit-0
 * without persisted state silently bypasses the Phase 17 teeth — the
 * commit-msg gate refuses the next commit while the CLI reported
 * success. Both writes are persistence the gates depend on; either
 * failing is a hook failure, not a warning.
 *
 * Returns true on success; false (with stderr error) on failure.
 * Callers MUST map false to exit code 1.
 */
async function writeMarkerSafe(args: MarkerWriteArgs): Promise<boolean> {
  const marker: HookRunMarker = {
    tip: args.tip,
    timestamp: new Date().toISOString(),
    runDir: args.runDir,
    disposition: args.disposition,
    findingsCount: args.findingsCount,
    promotedCount: args.promotedCount,
    slushedCount: args.slushedCount,
  };
  // Ensure parent dirs exist (the gate's read accepts missing dirs as
  // null; the write must create them on first use).
  await mkdir(join(args.repoRoot, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
  try {
    await writeHookRunMarker({ repoRoot: args.repoRoot, marker });
  } catch (err) {
    args.stderr.write(`implement-hook: marker write FAILED: ${(err as Error).message}\n`);
    return false;
  }
  // Also append to the per-run history log used by the pre-push gate
  // (Phase 17 Task 5). The single marker tracks "latest run"; the log
  // tracks every run by tip, which is what the pre-push gate needs to
  // walk a multi-commit range. Log append failure is ALSO fatal — the
  // pre-push gate relies on it.
  try {
    await appendHookRunLogEntry(args.repoRoot, {
      tip: marker.tip,
      timestamp: marker.timestamp,
      disposition: marker.disposition,
      runDir: marker.runDir,
    });
  } catch (err) {
    args.stderr.write(`implement-hook: hook-run-log append FAILED: ${(err as Error).message}\n`);
    return false;
  }
  return true;
}

async function readLatestBarrageTip(repoRoot: string): Promise<string | null> {
  // Best-effort: read the most-recent audit-runs/*/tip.sha. The
  // wrapper duplicates a tiny bit of check-barrage-tip's lookup so
  // the vars/diff range matches the new-diff guard's range exactly.
  try {
    const { readdir } = await import('node:fs/promises');
    const runsDir = join(repoRoot, '.dw-lifecycle', 'scope-discovery', 'audit-runs');
    const entries = await readdir(runsDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    if (dirs.length === 0) return null;
    const latest = join(runsDir, dirs[dirs.length - 1]!);
    const tipText = await readFile(join(latest, 'tip.sha'), 'utf8');
    const trimmed = tipText.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function tailFile(path: string, lines: number): Promise<string> {
  try {
    const text = await readFile(path, 'utf8');
    const split = text.split(/\r?\n/);
    return split.slice(Math.max(0, split.length - lines)).join('\n');
  } catch {
    return '';
  }
}

async function safeReadText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function writeVarsFile(vars: {
  featureSlug: string;
  workplanSummary: string;
  diff: string;
  auditLogExcerpt: string;
  commitSubjects: string;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dwl-impl-hook-'));
  const path = join(dir, 'vars.json');
  await writeFile(
    path,
    JSON.stringify(
      {
        feature_slug: vars.featureSlug,
        workplan_summary: vars.workplanSummary,
        diff: vars.diff,
        audit_log_excerpt: vars.auditLogExcerpt,
        commit_subjects: vars.commitSubjects,
      },
      null,
      2,
    ),
    'utf8',
  );
  return path;
}

async function reservePromptPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dwl-impl-hook-prompt-'));
  return join(dir, 'prompt.md');
}

export async function implementHookCli(rawArgs: string[]): Promise<void> {
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
  const exit = await runImplementHook({
    opts: parsed.opts,
    projectRoot,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  process.exit(exit);
}
