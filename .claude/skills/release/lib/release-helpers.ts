/**
 * /release skill helpers — TypeScript implementations called by SKILL.md
 * via tsx. See ../SKILL.md for the operator-facing flow.
 *
 * Test coverage: ./test/release-helpers.test.ts (vitest).
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type ValidateVersionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Validate that `version` is a strict-semver MAJOR.MINOR.PATCH AND is
 * strictly greater than `lastTag` (after stripping a leading 'v').
 *
 * Pure function — no I/O, no subprocesses.
 */
export function validateVersion(version: string, lastTag: string): ValidateVersionResult {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    return {
      ok: false,
      reason: `Version "${version}" is not in MAJOR.MINOR.PATCH format (regex: ${SEMVER_RE}).`,
    };
  }
  const [a, b, c] = [Number(match[1]), Number(match[2]), Number(match[3])];

  const stripped = lastTag.replace(/^v/, '');
  const lastMatch = SEMVER_RE.exec(stripped);
  if (!lastMatch) {
    return {
      ok: false,
      reason: `Last tag "${lastTag}" is not in MAJOR.MINOR.PATCH format (optional leading 'v').`,
    };
  }
  const [la, lb, lc] = [Number(lastMatch[1]), Number(lastMatch[2]), Number(lastMatch[3])];

  // Strictly-greater numeric tuple compare.
  if (a > la) return { ok: true };
  if (a < la) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (b > lb) return { ok: true };
  if (b < lb) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (c > lc) return { ok: true };
  return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
}

export interface PreconditionReport {
  readonly ok: boolean;
  readonly head: {
    readonly sha: string;
    readonly branch: string;
  };
  readonly relativeToOriginMain: {
    readonly aheadBy: number;
    readonly canFastForward: boolean;
  };
  readonly workingTreeClean: boolean;
  readonly trackingRemoteUpToDate: boolean;
  readonly lastReleaseTag: string | null;
  readonly failures: readonly string[];
}

export interface CheckPreconditionsOptions {
  readonly cwd?: string;
}

/**
 * Verify the working tree is in a state where a release can proceed:
 *   1. `git fetch origin` succeeds
 *   2. Working tree is clean (no diff, no staged, no untracked)
 *   3. HEAD has origin/main as ancestor (FF possible)
 *   4. Local branch is up-to-date with its tracking remote
 *
 * Returns a structured report; does not throw on precondition failures
 * (those are recorded in `failures[]`). Throws only on unexpected git
 * errors (network, missing remote, etc.).
 */
export async function checkPreconditions(
  opts: CheckPreconditionsOptions = {},
): Promise<PreconditionReport> {
  const cwd = opts.cwd ?? process.cwd();
  const failures: string[] = [];

  const git = (args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] }).toString();

  // (1) Fetch first so origin refs are fresh.
  try {
    git(['fetch', 'origin', '--quiet']);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`git fetch origin failed: ${reason}`);
  }

  // HEAD info.
  const headSha = git(['rev-parse', 'HEAD']).trim();
  const headBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  // (2) Working tree clean: no unstaged diff, no staged diff, no untracked.
  let workingTreeClean = true;
  try {
    git(['diff', '--quiet']);
  } catch {
    workingTreeClean = false;
    failures.push('working tree has uncommitted (unstaged) changes');
  }
  try {
    git(['diff', '--cached', '--quiet']);
  } catch {
    workingTreeClean = false;
    failures.push('working tree has staged changes');
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard']).trim();
  if (untracked.length > 0) {
    workingTreeClean = false;
    const lines = untracked.split('\n');
    const preview = lines.slice(0, 3).join(', ');
    const suffix = lines.length > 3 ? ', ...' : '';
    failures.push(`working tree has untracked files: ${preview}${suffix}`);
  }

  // (3) FF over origin/main?
  let canFastForward = false;
  let aheadBy = 0;
  try {
    git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
    canFastForward = true;
    const aheadStr = git(['rev-list', '--count', 'origin/main..HEAD']).trim();
    aheadBy = Number(aheadStr) || 0;
  } catch {
    canFastForward = false;
    failures.push('HEAD diverges from origin/main (FF not possible — rebase or merge first)');
  }

  // (4) Local branch up-to-date with tracking remote.
  let trackingRemoteUpToDate = false;
  try {
    const upstream = git(['rev-parse', '--abbrev-ref', `${headBranch}@{u}`]).trim();
    const behindStr = git(['rev-list', '--count', `HEAD..${upstream}`]).trim();
    const behind = Number(behindStr) || 0;
    if (behind === 0) {
      trackingRemoteUpToDate = true;
    } else {
      failures.push(`branch ${headBranch} is behind ${upstream} by ${behind} commit(s) — pull first`);
    }
  } catch {
    failures.push(`branch ${headBranch} has no upstream — set tracking with 'git push -u origin ${headBranch}' first`);
  }

  // (5) Last release tag (best-effort; null if no tags exist).
  let lastReleaseTag: string | null = null;
  try {
    lastReleaseTag = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']).trim() || null;
  } catch {
    lastReleaseTag = null;
  }

  return {
    ok: failures.length === 0,
    head: { sha: headSha, branch: headBranch },
    relativeToOriginMain: { aheadBy, canFastForward },
    workingTreeClean,
    trackingRemoteUpToDate,
    lastReleaseTag,
    failures,
  };
}

export interface AtomicPushOptions {
  readonly tag: string;
  readonly branch: string;
  /** cwd for git invocations. Default: process.cwd(). */
  readonly cwd?: string;
}

/**
 * Atomic push: HEAD to origin/main + HEAD to feature branch + annotated
 * tag, all in one --follow-tags RPC.
 *
 * DELIBERATE PRE-1.0 VELOCITY DECISION. Direct-to-main push (rather than
 * PR-merge) is intentional. Reasoning:
 *   - Solo-maintainer project; PRs add drag without catching real bugs
 *     (agent code-review already runs pre-commit)
 *   - CI on this project is brutally slow; PR + CI gate adds friction the
 *     project can't afford pre-1.0
 *   - Smoke (scripts/smoke-marketplace.sh) is the real release-blocking
 *     gate and runs locally before this function executes
 *
 * REVISIT AT 1.0 STABILIZATION. Once the project stabilizes, the case for
 * PR-merge / CI-as-second-gate / branch protection grows substantially:
 *   - Adopter base widens; CI catching regressions before tag-push protects them
 *   - Multi-contributor work becomes plausible; PR is established muscle
 *   - Branch protection on main becomes appropriate
 * When this happens, replace this function with a PR-merge flow and
 * remove this comment.
 *
 * Throws on push failure with git's stderr included. Local state (commit
 * and tag) is preserved.
 */
export async function atomicPush(opts: AtomicPushOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  try {
    execFileSync(
      'git',
      [
        'push',
        '--follow-tags',
        'origin',
        'HEAD:main',
        `HEAD:refs/heads/${opts.branch}`,
      ],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err) {
    let stderr: string;
    if (
      err instanceof Error &&
      'stderr' in err &&
      err.stderr !== null &&
      err.stderr !== undefined
    ) {
      const raw = err.stderr;
      stderr = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
    } else if (err instanceof Error) {
      stderr = err.message;
    } else {
      stderr = String(err);
    }
    throw new Error(`atomicPush failed (tag=${opts.tag}, branch=${opts.branch}):\n${stderr}`);
  }
}

// ---------------------------------------------------------------------
// CLI dispatcher — invoked when this file is run directly via tsx.
// SKILL.md prose calls these subcommands.
// ---------------------------------------------------------------------

function formatPreconditionReport(report: PreconditionReport): string {
  const lines: string[] = [];
  lines.push(`HEAD: ${report.head.sha.slice(0, 7)} (${report.head.branch})`);
  lines.push(
    `Relative to origin/main: ${report.relativeToOriginMain.aheadBy} commits ahead, fast-forward ${report.relativeToOriginMain.canFastForward ? 'possible' : 'NOT possible'}`,
  );
  lines.push(`Working tree: ${report.workingTreeClean ? 'clean' : 'DIRTY'}`);
  lines.push(
    `Tracking remote: ${report.trackingRemoteUpToDate ? 'up-to-date' : 'NOT up-to-date'}`,
  );
  lines.push(`Last release: ${report.lastReleaseTag ?? '(no tags found)'}`);
  if (report.failures.length > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const f of report.failures) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}

async function dispatch(argv: readonly string[]): Promise<number> {
  const [subcommand, ...args] = argv;
  switch (subcommand) {
    case 'check-preconditions': {
      const report = await checkPreconditions();
      process.stdout.write(formatPreconditionReport(report) + '\n');
      return report.ok ? 0 : 1;
    }
    case 'validate-version': {
      const [version, lastTag] = args;
      if (!version || !lastTag) {
        process.stderr.write('usage: validate-version <version> <last-tag>\n');
        return 2;
      }
      const result = validateVersion(version, lastTag);
      if (!result.ok) process.stderr.write(result.reason + '\n');
      return result.ok ? 0 : 1;
    }
    case 'atomic-push': {
      const [tag, branch] = args;
      if (!tag || !branch) {
        process.stderr.write('usage: atomic-push <tag> <branch>\n');
        return 2;
      }
      await atomicPush({ tag, branch });
      return 0;
    }
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand ?? '(none)'}\n`);
      return 2;
  }
}

// Run when invoked directly via tsx (not when imported). Uses
// pathToFileURL so the comparison survives symlinks and Windows path
// quirks (a naive `file://${process.argv[1]}` breaks on either).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dispatch(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
      process.exit(1);
    },
  );
}
