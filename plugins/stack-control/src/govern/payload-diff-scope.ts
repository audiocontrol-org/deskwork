// 030 — committed-diff scoping (the FR-023 inclusion-based successor to the
// deleted exclusion-based composition plumbing). Scopes the governedSha..HEAD
// committed diff (the changed file set + per-file diff text) and folds untracked
// working-tree files into scope, producing a non-empty diffScope.files for a real
// committed-diff feature. Implemented in Phase 3 (T021).

import { spawnSync } from 'node:child_process';
import { relative, sep } from 'node:path';

/** The scoped diff: the changed file set + per-file diff text over governedSha..HEAD. */
export interface DiffScope {
  readonly base: string;
  readonly head: string;
  readonly files: readonly string[];
  readonly fileDiffs: ReadonlyMap<string, string>;
}

/**
 * The resolved implement-mode exclusion set — the single source of truth for which
 * installation-relative paths fall OUT of the audited committed diff. Both
 * `buildImplementVars` (which renders them as `:(exclude)<rel>` git pathspecs) and
 * the end-govern pipeline runtime (which filters `scopeCommittedDiff` output via
 * `filterDiffScope`) derive from this — so the two arms can never drift
 * (AUDIT-20260622-02). The structured fields beyond `excludeDiffRels` are the
 * intermediates `buildImplementVars` also needs for its untracked-fold arm.
 */
export interface ImplementExclusion {
  /** The feature root, installation-relative (POSIX separators), or undefined. */
  readonly featureRel: string | undefined;
  /** Whether the feature root lies inside the installation subtree. */
  readonly featureInside: boolean;
  /** The feature root when it lies OUTSIDE the installation (the cross-tree layout). */
  readonly crossTreeFeatureRoot: string | undefined;
  /** Other in-repo feature roots (installation-relative), excluding the feature's own. */
  readonly otherFeatureRels: readonly string[];
  /** Caller-threaded governance-bookkeeping paths, installation-relative + in-repo. */
  readonly excludePathRels: readonly string[];
  /** The installation-relative paths excluded from the committed diff. */
  readonly excludeDiffRels: readonly string[];
}

/**
 * Derive the implement-mode exclusion set from the feature root, the full feature-root
 * list (`excludeRoots`), and the caller-threaded bookkeeping paths (`excludePaths`).
 * Mirrors specs/014 US5 (FR-007, AUDIT-20260611-08): drop the feature's own audit-log
 * (when inside the installation), every OTHER feature root's audit-log.md, and the
 * governance-bookkeeping paths — all the surfaces a self-reference generator would
 * quote back to the fleet.
 */
export function resolveImplementExclusion(
  installationRoot: string,
  featureRoot: string | undefined,
  excludeRoots: readonly string[] | undefined,
  excludePaths: readonly string[] | undefined,
): ImplementExclusion {
  const relify = (abs: string): string => relative(installationRoot, abs).split(sep).join('/');
  const inRepo = (rel: string): boolean => rel.length > 0 && rel !== '..' && !rel.startsWith('../');
  const featureRel = featureRoot !== undefined ? relify(featureRoot) : undefined;
  const featureInside = featureRel !== undefined && inRepo(featureRel);
  const crossTreeFeatureRoot =
    featureRoot !== undefined && !featureInside ? featureRoot : undefined;
  const otherFeatureRels =
    featureRoot !== undefined
      ? (excludeRoots ?? []).map(relify).filter((root) => inRepo(root) && root !== featureRel)
      : [];
  const excludePathRels =
    featureRoot !== undefined ? (excludePaths ?? []).map(relify).filter(inRepo) : [];
  const excludeDiffRels = [
    ...(featureInside ? [`${featureRel}/audit-log.md`] : []),
    ...otherFeatureRels.map((root) => `${root}/audit-log.md`),
    ...excludePathRels,
  ];
  return {
    featureRel,
    featureInside,
    crossTreeFeatureRoot,
    otherFeatureRels,
    excludePathRels,
    excludeDiffRels,
  };
}

/**
 * Drop every file under one of the excluded installation-relative paths from a
 * DiffScope (exact match OR directory-prefix), preserving per-file diffs for the
 * survivors. The inclusion-based successor to git's `:(exclude)<rel>` pathspecs, so
 * the pipeline audits exactly the surface `buildImplementVars` would (AUDIT-20260622-02).
 */
export function filterDiffScope(scope: DiffScope, excludeRels: readonly string[]): DiffScope {
  if (excludeRels.length === 0) return scope;
  const excluded = (f: string): boolean =>
    excludeRels.some((rel) => f === rel || f.startsWith(`${rel}/`));
  const files = scope.files.filter((f) => !excluded(f));
  const fileDiffs = new Map<string, string>();
  for (const f of files) {
    const d = scope.fileDiffs.get(f);
    if (d !== undefined) fileDiffs.set(f, d);
  }
  return { base: scope.base, head: scope.head, files, fileDiffs };
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

/**
 * `git diff --no-index <a> <b>` for the untracked-fold. This form exits with status
 * 1 when the two inputs differ (the expected case here — an untracked file vs the
 * empty `/dev/null`) and status 0 only when identical; a spawn error or status >1 is
 * a real failure. We mirror the same `-c core.quotePath=false` + `--relative`
 * conventions the tracked-diff arm uses so non-ASCII and subdir-relative paths stay
 * byte-identical to the committed-diff arm.
 */
function gitDiffNoIndex(root: string, args: readonly string[]): string {
  const r = spawnSync(
    'git',
    ['-C', root, '-c', 'core.quotePath=false', 'diff', '--no-index', '--relative', ...args],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  // 0 = identical (no diff text), 1 = differ (unified diff on stdout); both are success.
  if (r.status !== 0 && r.status !== 1) {
    const detail = typeof r.stderr === 'string' ? r.stderr.trim() : (r.error?.message ?? 'unknown error');
    throw new Error(`govern: git diff --no-index ${args.join(' ')} failed in ${root}: ${detail}`);
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

  // Untracked-fold: working-tree files not yet committed are rendered as STANDARD
  // `git diff --no-index` unified diffs (diff --git / --- / +++ / @@ hunk headers),
  // so the partitioner/barrage treats them uniformly with the committed-diff arm —
  // NOT a hand-synthesized `+`-line-only blob (FR-030, T080). `git ls-files` from the
  // installation subdir already lists installation-relative paths; diffing against
  // /dev/null yields a full added-file unified diff. `--relative` + `core.quotePath`
  // mirror the tracked arm above so the path base stays installation-relative and
  // non-ASCII names stay literal UTF-8.
  for (const f of lines(git(installationRoot, ['ls-files', '--others', '--exclude-standard']))) {
    if (fileDiffs.has(f)) continue;
    fileDiffs.set(f, gitDiffNoIndex(installationRoot, ['--', '/dev/null', f]));
    files.push(f);
  }

  return { base, head, files: files.sort(), fileDiffs };
}

/**
 * The in-range commit subjects (`git log <base>..HEAD --oneline`) scoped to the
 * installation subtree (`-- .`) — the metadata the barrage prompt's `commit_subjects`
 * var carries. Subtree-scoped to match `scopeCommittedDiff` (the whole-feature pipeline
 * operates on the installation subtree; cross-tree feature anchors are out of scope here,
 * 030 clean break). Replaces the per-commit-subjects arm of the deleted
 * `assembleImplementPayload` (T085). Returns '' when the range is empty.
 */
export function implementCommitSubjects(installationRoot: string, base: string): string {
  // Tolerant (gitTry): a missing base / empty / non-git tree degrades to '' rather than
  // aborting — mirrors the deleted assembler's `|| true` git-read semantics.
  const out = gitTry(installationRoot, ['log', `${base}..HEAD`, '--oneline', '--', '.']);
  if (out === undefined) return '';
  const subjects = lines(out);
  return subjects.length === 0 ? '' : `${subjects.join('\n')}\n`;
}
