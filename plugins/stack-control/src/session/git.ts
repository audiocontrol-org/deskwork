// 011 T005 — foundational git primitives for the session verbs. Branch-staleness
// (US4) and the journal boundary + commit/push (US2) both sit on git; this is the
// single git layer for the session feature (reuses repo.ts's execFile precedent,
// arg-array form to avoid shell interpolation). Each function takes an explicit
// cwd so the pure logic is unit-testable against tmp repos. Fail-soft where the
// answer is genuinely undeterminable (no upstream / detached HEAD / shallow
// history) — a named skip, never a fabricated value (Principle V).

import { execFileSync } from 'node:child_process';

/** The branch-staleness base, or an explicit reason it can't be determined. */
export type BaseResolution =
  | { readonly kind: 'resolved'; readonly base: string }
  | { readonly kind: 'undeterminable'; readonly reason: string };

export interface AheadBehind {
  readonly ahead: number;
  readonly behind: number;
}

export interface SessionBoundaryOptions {
  /** Explicit boundary ref (highest precedence). */
  readonly since?: string;
  /** Commits-back fallback when no base resolves (research D5). Default 1. */
  readonly fallbackN?: number;
}

/** Run a git command; return its trimmed stdout, or null on any non-zero/throw. */
function tryGit(cwd: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Run a git command, throwing a descriptive error on failure (non-soft path). */
function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}

/** One commit in the session range. */
export interface CommitRecord {
  readonly sha: string;
  readonly subject: string;
  readonly body: string;
}

const RECORD_SEP = '\x1e';
const FIELD_SEP = '\x1f';

/** Commits in `<boundary>..HEAD`, newest first. Empty when the range is empty. */
export function commitsSince(cwd: string, boundary: string): readonly CommitRecord[] {
  const out = git(cwd, [
    'log',
    `--format=%H${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`,
    `${boundary}..HEAD`,
  ]);
  if (out.length === 0) return [];
  return out
    .split(RECORD_SEP)
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((r) => {
      const [sha = '', subject = '', body = ''] = r.split(FIELD_SEP);
      return { sha: sha.trim(), subject: subject.trim(), body: body.trim() };
    });
}

/** Count of distinct files changed across `<boundary>..HEAD`. */
export function filesChangedSince(cwd: string, boundary: string): number {
  const out = git(cwd, ['diff', '--name-only', `${boundary}..HEAD`]);
  if (out.length === 0) return 0;
  return new Set(out.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)).size;
}

/**
 * Resolve the staleness base (research D3): the configured upstream if set, else
 * the repository default branch (origin/HEAD → origin/main → origin/master), else
 * undeterminable (no remote, or a detached HEAD with neither).
 */
export function resolveBase(cwd: string): BaseResolution {
  const upstream = tryGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (upstream !== null && upstream.length > 0) {
    return { kind: 'resolved', base: upstream };
  }

  const originHead = tryGit(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (originHead !== null && originHead.startsWith('refs/remotes/')) {
    return { kind: 'resolved', base: originHead.slice('refs/remotes/'.length) };
  }

  for (const candidate of ['origin/main', 'origin/master']) {
    if (tryGit(cwd, ['rev-parse', '--verify', '--quiet', candidate]) !== null) {
      return { kind: 'resolved', base: candidate };
    }
  }

  return {
    kind: 'undeterminable',
    reason: 'no upstream set and no remote default branch (origin/HEAD, origin/main, origin/master)',
  };
}

/**
 * Commits HEAD is behind/ahead of `base`. `git rev-list --left-right --count
 * base...HEAD` prints "<behind>\t<ahead>" (left = base-only, right = HEAD-only).
 */
export function aheadBehind(cwd: string, base: string): AheadBehind {
  const out = git(cwd, ['rev-list', '--left-right', '--count', `${base}...HEAD`]);
  const [behindStr, aheadStr] = out.split(/\s+/);
  return { behind: Number(behindStr ?? 0), ahead: Number(aheadStr ?? 0) };
}

/**
 * The session-boundary SHA (research D5): explicit `--since` (resolved to a SHA)
 * → merge-base with the resolved base branch → `HEAD~N` fallback. When even
 * HEAD~N is out of range (shallow history), bottom out at the root commit so the
 * `<boundary>..HEAD` range is always valid.
 */
export function sessionBoundary(cwd: string, opts: SessionBoundaryOptions = {}): string {
  if (opts.since !== undefined && opts.since.length > 0) {
    return git(cwd, ['rev-parse', opts.since]);
  }

  const base = resolveBase(cwd);
  if (base.kind === 'resolved') {
    const mergeBase = tryGit(cwd, ['merge-base', base.base, 'HEAD']);
    if (mergeBase !== null && mergeBase.length > 0) return mergeBase;
  }

  const n = opts.fallbackN ?? 1;
  const back = tryGit(cwd, ['rev-parse', `HEAD~${n}`]);
  if (back !== null && back.length > 0) return back;

  // Shallow / fewer-than-N history: bottom out at the root commit.
  const root = tryGit(cwd, ['rev-list', '--max-parents=0', 'HEAD']);
  if (root !== null && root.length > 0) return root.split(/\s+/)[0]!;

  return git(cwd, ['rev-parse', 'HEAD']);
}
