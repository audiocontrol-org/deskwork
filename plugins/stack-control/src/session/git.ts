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
  /**
   * Path to the development journal (TASK-39). When set and the file has commit
   * history, the boundary anchors at the LAST commit that touched it — i.e. the
   * previous session-end — so the window captures exactly this session's commits.
   * This is robust to the merge-base-with-upstream collapse: on a long-lived
   * feature branch pushed up to HEAD, merge-base(upstream, HEAD) === HEAD and the
   * window would otherwise be empty ("0 commits this session").
   */
  readonly journalPath?: string;
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
 * Resolve the repository DEFAULT branch (origin/HEAD → origin/main → origin/master),
 * IGNORING the current branch's `@{upstream}`. This is the base for "has this landed
 * on the trunk?" questions — the off-rail merge signal (032 AUDIT-20260623-04). It must
 * NOT prefer `@{upstream}`: on a feature branch tracking `origin/<feature>`, pushing a
 * convergence record to that feature branch makes the record reachable from the upstream
 * even though it has NOT merged to `main` — which would be a false "merged" signal.
 */
export function resolveDefaultBase(cwd: string): BaseResolution {
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
    reason: 'no remote default branch (origin/HEAD, origin/main, origin/master)',
  };
}

/**
 * Resolve the staleness base (research D3): the configured upstream if set, else the
 * repository default branch (origin/HEAD → origin/main → origin/master), else
 * undeterminable. The `@{upstream}` preference is correct for STALENESS ("am I behind my
 * own upstream?") — but NOT for the merge signal (use `resolveDefaultBase` for that).
 */
export function resolveBase(cwd: string): BaseResolution {
  const upstream = tryGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (upstream !== null && upstream.length > 0) {
    return { kind: 'resolved', base: upstream };
  }
  return resolveDefaultBase(cwd);
}

/**
 * 032 US3 — the SHA of the last commit that touched `path` (the commit that wrote
 * the govern convergence record), or null when the path has no commit history (never
 * committed). `path` may be absolute or repo-relative.
 */
export function lastCommitTouching(cwd: string, path: string): string | null {
  const sha = tryGit(cwd, ['log', '-1', '--format=%H', '--', path]);
  return sha !== null && sha.length > 0 ? sha : null;
}

/**
 * 032 US3 (FR-012) — is `commit` an ancestor of the resolved default-branch base
 * (origin/main, via `resolveBase`)? The off-rail merge backstop keys on this: an
 * item whose govern convergence-record commit is reachable from the base while its
 * status is still in-flight has been merged off-rail. Returns `true` when reachable,
 * `false` when not (or `commit` is unresolvable), and `null` when the base is
 * undeterminable (detached HEAD / no remote) — fail-open for detection so a no-remote
 * installation never yields a false refusal (the on-rail weld never depends on this).
 */
export function isReachableFromBase(commit: string, cwd: string): boolean | null {
  // 032 AUDIT-20260623-04: the merge signal asks "has this landed on the TRUNK?", so it
  // resolves the DEFAULT branch (origin/main), NOT the current branch's `@{upstream}` — a
  // feature-branch upstream containing the record commit is NOT a merge to main.
  const base = resolveDefaultBase(cwd);
  if (base.kind !== 'resolved') return null;
  // `git merge-base --is-ancestor <commit> <base>` exits 0 iff commit is an ancestor
  // of base, 1 when it is not, and non-zero on any other error (e.g. an unknown
  // commit) — all of which mean "not provably reachable" → false (never a refusal we
  // can't justify). Base-undeterminable is the only `null` (handled above).
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, base.base], {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
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
 * The session-boundary SHA: explicit `--since` (resolved to a SHA) → the last
 * commit that touched the journal (the previous session-end, TASK-39) → merge-base
 * with the resolved base branch (research D5) → `HEAD~N` fallback. When even HEAD~N
 * is out of range (shallow history), bottom out at the root commit so the
 * `<boundary>..HEAD` range is always valid.
 */
export function sessionBoundary(cwd: string, opts: SessionBoundaryOptions = {}): string {
  if (opts.since !== undefined && opts.since.length > 0) {
    return git(cwd, ['rev-parse', opts.since]);
  }

  // Journal anchor (TASK-39): the last commit that modified the journal marks the
  // previous session-end. `<that>..HEAD` is exactly this session's window — robust
  // to a pushed-up upstream that would collapse the merge-base to HEAD. Absent
  // journal history (first session) falls through to the base heuristic below.
  if (opts.journalPath !== undefined && opts.journalPath.length > 0) {
    const lastJournalCommit = tryGit(cwd, ['log', '-1', '--format=%H', '--', opts.journalPath]);
    if (lastJournalCommit !== null && lastJournalCommit.length > 0) return lastJournalCommit;
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
