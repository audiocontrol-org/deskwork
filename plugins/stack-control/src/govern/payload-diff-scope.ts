// 030 — committed-diff scoping (the FR-023 inclusion-based successor to the
// deleted exclusion-based composition plumbing). Scopes the governedSha..HEAD
// committed diff (the changed file set + per-file diff text) and folds untracked
// working-tree files into scope, producing a non-empty diffScope.files for a real
// committed-diff feature. Implemented in Phase 3 (T021).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The scoped diff: the changed file set + per-file diff text over governedSha..HEAD. */
export interface DiffScope {
  readonly base: string;
  readonly head: string;
  readonly files: readonly string[];
  readonly fileDiffs: ReadonlyMap<string, string>;
}

function git(root: string, args: readonly string[]): string {
  // `-c core.quotePath=false` keeps non-ASCII paths as literal UTF-8 in `--name-only`
  // output. With git's default quoting, a path like `task — em-dash.md` (U+2014) is
  // C-quoted ("task \342\200\224 em-dash.md"); that quoted string does NOT resolve as a
  // pathspec, so the per-file `git diff -- <quoted>` matches nothing and the file enters
  // scope with an EMPTY diff — starving the partitioner (160/255 files in this repo).
  const r = spawnSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    const detail = typeof r.stderr === 'string' ? r.stderr.trim() : (r.error?.message ?? 'unknown error');
    throw new Error(`govern: git ${args.join(' ')} failed in ${root}: ${detail}`);
  }
  return typeof r.stdout === 'string' ? r.stdout : '';
}

/** Non-throwing git: returns trimmed stdout on success, undefined on any non-zero/spawn error. */
function gitTry(root: string, args: readonly string[]): string | undefined {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return undefined;
  const out = typeof r.stdout === 'string' ? r.stdout.trim() : '';
  return out.length > 0 ? out : undefined;
}

/** The repo's default branch ref, best-effort: origin/HEAD → `main` → `master` → undefined. */
function resolveDefaultBranch(gitRoot: string): string | undefined {
  const sym = gitTry(gitRoot, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (sym !== undefined) return sym.replace(/^refs\/remotes\//, ''); // e.g. origin/main
  for (const candidate of ['main', 'master']) {
    if (gitTry(gitRoot, ['rev-parse', '--verify', '--quiet', candidate]) !== undefined) return candidate;
  }
  return undefined;
}

/**
 * Resolve implement-mode's whole-feature diff base. An explicit base (the `--diff-base`
 * flag or `GOVERN_DIFF_BASE`, threaded by the caller) wins. Otherwise default to the
 * FEATURE FORK POINT — the merge-base with the repo default branch — so a bare
 * `stackctl govern --mode implement` audits the WHOLE feature, not just the last commit.
 * HEAD~1 was the prior default and silently scoped one commit (dogfood finding). The
 * documented fallback to HEAD~1 covers the degenerate cases (on the default branch, a
 * detached HEAD, or an unresolvable default branch) where there is no feature span.
 */
export function resolveImplementDiffBase(installationRoot: string, explicit: string | undefined): string {
  if (explicit !== undefined && explicit.trim() !== '') return explicit;
  const gitRoot = gitTry(installationRoot, ['rev-parse', '--show-toplevel']) ?? installationRoot;
  const def = resolveDefaultBranch(gitRoot);
  if (def !== undefined) {
    const mergeBase = gitTry(gitRoot, ['merge-base', 'HEAD', def]);
    const head = gitTry(gitRoot, ['rev-parse', 'HEAD']);
    if (mergeBase !== undefined && mergeBase !== head) return mergeBase;
  }
  return 'HEAD~1';
}

function lines(out: string): string[] {
  return out.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Scope the committed base..HEAD diff (plus untracked-fold) into an inclusion-based DiffScope. */
export function scopeCommittedDiff(installationRoot: string, base: string, head: string): DiffScope {
  const fileDiffs = new Map<string, string>();
  const files: string[] = [];

  // `--relative` is load-bearing here (it mirrors the render arm in payload-implement.ts).
  // Without it, `git diff --name-only` emits git-root-relative paths even when run with
  // `-C <installation subdir>`, so the per-file `git diff -- <p>` pathspec — resolved
  // against the installation subdir — misses every file → empty per-file diffs. In the
  // monorepo layout (`.stack-control` at plugins/<plugin>, git root the repo above) that
  // made the chunk partitioner measure ~0 bytes and never chunk (firing a whole
  // over-envelope payload as one barrage). With `--relative`: per-file pathspecs resolve
  // correctly AND the path base is installation-relative + installation-subtree-only —
  // byte-identical to the render's committed-diff arm, so the chunk scope it produces
  // matches the render's pathScope filter exactly. (Single-rooted repo: the installation
  // and the git toplevel coincide, so `--relative` is a no-op there.)
  for (const f of lines(git(installationRoot, ['diff', '--relative', '--name-only', base, head]))) {
    fileDiffs.set(f, git(installationRoot, ['diff', '--relative', base, head, '--', f]));
    files.push(f);
  }

  // Untracked-fold: working-tree files not yet committed are rendered as added-line diffs.
  // `git ls-files` from the installation subdir already lists installation-relative paths.
  for (const f of lines(git(installationRoot, ['ls-files', '--others', '--exclude-standard']))) {
    if (fileDiffs.has(f)) continue;
    const content = readFileSync(join(installationRoot, f), 'utf8');
    fileDiffs.set(f, content.split('\n').map((l) => `+${l}`).join('\n'));
    files.push(f);
  }

  return { base, head, files: files.sort(), fileDiffs };
}
