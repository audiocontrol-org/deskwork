// 030 T021 (RED first) — FR-023: inclusion-based committed-diff scoping (the
// successor to the deleted exclusion plumbing). scopeCommittedDiff resolves the
// base..HEAD changed-file set with per-file diffs (non-empty for a real
// committed diff) and folds untracked working-tree files into scope. On-disk git
// fixtures only (real git init/commits), per .claude/rules/testing.md. Watched to
// FAIL while scopeCommittedDiff is a 'not implemented' stub (T021 impl makes it
// pass).

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scopeCommittedDiff,
  filterDiffScope,
  resolveImplementExclusion,
} from '../../govern/payload-diff-scope.js';

function git(repo: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return typeof r.stdout === 'string' ? r.stdout.trim() : '';
}
function commitAll(repo: string, message: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync(
    'git',
    ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-gpg-sign', '-m', message],
    { encoding: 'utf8' },
  );
}
function head(repo: string): string {
  return git(repo, 'rev-parse', 'HEAD');
}
function setup(): string {
  const repo = mkdtempSync(join(tmpdir(), 'diff-scope-'));
  git(repo, 'init', '-q');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'README.md'), 'seed\n');
  commitAll(repo, 'chore: seed');
  return repo;
}

describe('030 T021 — payload-diff-scope (FR-023)', () => {
  it('scopes the committed base..HEAD diff to a non-empty file set with per-file diffs', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/app.ts'), 'export const x = 1;\n');
    commitAll(repo, 'feat: add app');
    const h = head(repo);
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      expect(scope.files).toContain('src/app.ts');
      expect(scope.files.length).toBeGreaterThan(0);
      expect(scope.fileDiffs.get('src/app.ts') ?? '').toMatch(/export const x = 1/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('folds an untracked working-tree file into the scope', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/committed.ts'), 'a\n');
    commitAll(repo, 'feat: committed');
    const h = head(repo);
    writeFileSync(join(repo, 'src/untracked.ts'), 'b\n'); // not committed
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      expect(scope.files).toContain('src/committed.ts');
      expect(scope.files).toContain('src/untracked.ts');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // 030 T075 (FR-030, US9) — the untracked-fold must render a STANDARD unified
  // diff (the `git diff --no-index` format the rest of the render arm produces),
  // NOT a hand-synthesized `+`-line-only blob. The fold emits a real unified diff
  // (`diff --git`/`---`/`+++`/`@@` hunk headers) so the folded untracked diff is
  // treated uniformly with the committed-diff arm by the partitioner/barrage. This
  // pins the standard-diff shape (a `@@` hunk header and a `+++ ` file header).
  it('T075 (FR-030) renders an untracked file as a STANDARD git-diff --no-index unified diff, not a synthetic +-line blob', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/committed.ts'), 'a\n');
    commitAll(repo, 'feat: committed');
    const h = head(repo);
    writeFileSync(join(repo, 'src/untracked.ts'), 'line one\nline two\n'); // not committed
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      const folded = scope.fileDiffs.get('src/untracked.ts') ?? '';
      // The folded untracked diff is a standard unified diff: it carries an `@@`
      // hunk header and a `+++ ` file header (as `git diff --no-index` produces),
      // NOT merely every content line prefixed with `+` and no hunk structure.
      expect(folded, 'untracked fold must contain a @@ hunk header').toMatch(/^@@ .* @@/m);
      expect(folded, 'untracked fold must contain a +++ file header').toMatch(/^\+\+\+ /m);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // TASK-436 — the untracked-fold is a convenience-fold (not the committed govern
  // target). A LARGE untracked file must keep its PATH in scope (FR-027 "path
  // preserved, bytes withheld") but must NOT carry its full body into the audit
  // payload, else a generated/scratch file bloats every barrage lane.
  it('TASK-436 withholds the body of an OVERSIZED untracked file but preserves its path', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/committed.ts'), 'a\n');
    commitAll(repo, 'feat: committed');
    const h = head(repo);
    const huge = `${'a'.repeat(2 * 1024 * 1024)}\n`; // ~2 MiB, safely over any per-file budget
    writeFileSync(join(repo, 'src/huge.generated.ts'), huge);
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      expect(scope.files, 'path preserved in scope').toContain('src/huge.generated.ts');
      const body = scope.fileDiffs.get('src/huge.generated.ts') ?? '';
      expect(Buffer.byteLength(body), 'oversized body must be withheld, not folded whole').toBeLessThan(
        4096,
      );
      expect(body, 'withheld note explains why').toMatch(/withheld/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // TASK-436 — a BINARY untracked file carries no auditable source. Its path is
  // preserved in scope but its body is withheld (never the raw bytes / full blob).
  it('TASK-436 withholds the body of a BINARY untracked file but preserves its path', () => {
    const repo = setup();
    const base = head(repo);
    writeFileSync(join(repo, 'src/committed.ts'), 'a\n');
    commitAll(repo, 'feat: committed');
    const h = head(repo);
    // A buffer with NUL bytes — git detects this as binary in `git diff --no-index`.
    writeFileSync(join(repo, 'asset.bin'), Buffer.from([0, 1, 2, 0, 255, 0, 42, 0]));
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      expect(scope.files, 'path preserved in scope').toContain('asset.bin');
      const body = scope.fileDiffs.get('asset.bin') ?? '';
      expect(body, 'binary body withheld with a note').toMatch(/withheld/i);
      expect(body, 'note names the binary reason').toMatch(/binary/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // Regression: the installation root is a SUBDIR of the git root (the monorepo
  // layout — `.stack-control` lives at plugins/stack-control while the git root is
  // the repo above). `git diff --name-only` emits git-root-relative paths; running
  // the per-file `git diff -- <path>` from the installation subdir resolves the
  // pathspec relative to the subdir and matches NOTHING, yielding empty per-file
  // diffs (~0 bytes) — which silently defeats the chunk partitioner (it measures
  // ~0 bytes, never chunks, and fires a whole over-envelope payload as one barrage).
  it('resolves real per-file diffs when the installation root is a SUBDIR of the git root', () => {
    const repo = setup(); // git root
    const install = join(repo, 'plugins', 'sc'); // installation root (a subdir)
    mkdirSync(join(install, 'src'), { recursive: true });
    const base = head(repo);
    writeFileSync(join(install, 'src/app.ts'), 'export const sub = 1;\n');
    commitAll(repo, 'feat: add app under subdir installation');
    const h = head(repo);
    try {
      const scope = scopeCommittedDiff(install, base, h);
      // The changed file is present and its per-file diff is NON-EMPTY (the bug
      // returned ~0 bytes here). Path base is installation-relative (`--relative`),
      // byte-identical to the render's committed-diff arm.
      const total = [...scope.fileDiffs.values()].reduce((n, d) => n + d.length, 0);
      expect(total).toBeGreaterThan(0);
      const appEntry = [...scope.fileDiffs.entries()].find(([f]) => f.endsWith('src/app.ts'));
      expect(appEntry, 'the committed app.ts must be in scope').toBeDefined();
      expect(appEntry?.[1] ?? '').toMatch(/export const sub = 1/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  // Regression: a committed file whose name contains a non-ASCII character (e.g. the
  // em-dash in backlog task filenames). git's default `core.quotePath=true` C-quotes
  // such paths in `--name-only` output ("...\342\200\224...md"); that quoted string
  // does NOT resolve as a pathspec, so the per-file `git diff -- <quoted>` matches
  // nothing and the file lands in scope with an EMPTY diff. 160/255 files in this very
  // repo hit this — silently starving the partition of most of the diff's bytes.
  it('resolves a real per-file diff for a committed file with a non-ASCII (em-dash) name', () => {
    const repo = setup();
    const base = head(repo);
    const name = 'src/task — em-dash.md'; // U+2014 EM DASH in the filename
    writeFileSync(join(repo, name), 'body line one\n');
    commitAll(repo, 'docs: add em-dash named file');
    const h = head(repo);
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      const entry = [...scope.fileDiffs.entries()].find(([f]) => f.includes('em-dash'));
      expect(entry, 'the em-dash file must be in scope').toBeDefined();
      // Path is the literal UTF-8 name, NOT a git-C-quoted string.
      expect(entry?.[0] ?? '').not.toMatch(/\\\d{3}/); // no octal \342 etc.
      expect(entry?.[1] ?? '').toMatch(/body line one/); // per-file diff is non-empty
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// TASK-429 (restores the rename-aware coverage deleted with assembleImplementPayload
// in T085) — a pure tree-move within scope must PAIR as a rename, not emit a full
// delete + full add. Without forced `-M` an endpoint diff across a relocation ships
// the whole file body TWICE (doubled → oversized chunks), the exact TASK-47 failure.
// The scope must NOT depend on the operator's diff.renames config — it forces -M.
describe('030 — rename-aware committed-diff scoping (TASK-429 / TASK-47)', () => {
  it('pairs an in-scope tree-move as a rename even when diff.renames=false', () => {
    const repo = setup();
    // A substantial, uniquely-marked file at the original path.
    const body = `${Array.from({ length: 40 }, (_, i) => `export const RENAME_MARKER_${i} = ${i} * 7;`).join('\n')}\n`;
    writeFileSync(join(repo, 'src/original.ts'), body);
    commitAll(repo, 'feat: add original');
    const base = head(repo);
    // Pure tree-move (100% similarity), then disable git's default rename detection.
    git(repo, 'mv', 'src/original.ts', 'src/relocated.ts');
    commitAll(repo, 'refactor: relocate original -> relocated');
    git(repo, 'config', 'diff.renames', 'false');
    const h = head(repo);
    try {
      const scope = scopeCommittedDiff(repo, base, h);
      const all = [...scope.fileDiffs.values()].join('\n');
      // Paired as a rename: the diff carries the rename headers...
      expect(all, 'tree-move must pair as a rename').toMatch(/rename from src\/original\.ts/);
      expect(all).toMatch(/rename to src\/relocated\.ts/);
      // ...and NOT the file body twice (a paired rename of unchanged content ships
      // zero +/- body hunks; without -M the marker appears as both a - and a +).
      expect(all, 'no doubled added body').not.toMatch(/^\+export const RENAME_MARKER_/m);
      expect(all, 'no doubled deleted body').not.toMatch(/^-export const RENAME_MARKER_/m);
      // The OLD path is not a separate full-deletion scoped entry.
      expect(scope.files).not.toContain('src/original.ts');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// AUDIT-20260622-02 — the end-govern pipeline's scopeDiff dropped ALL payload
// exclude paths: it called scopeCommittedDiff (no exclusion args) so spec docs,
// contracts, and the feature's own audit-log flowed into the audited surface.
// filterDiffScope + resolveImplementExclusion are the single-source exclusion the
// runtime applies AND buildImplementVars derives its `:(exclude)` pathspecs from.
describe('030 — diff-scope exclusion (AUDIT-20260622-02)', () => {
  it('filterDiffScope drops an exactly-matched excluded file but keeps the rest', () => {
    const scope = {
      base: 'B',
      head: 'H',
      files: ['src/app.ts', 'specs/030/audit-log.md'],
      fileDiffs: new Map([
        ['src/app.ts', 'diff a'],
        ['specs/030/audit-log.md', 'diff b'],
      ]),
    };
    const filtered = filterDiffScope(scope, ['specs/030/audit-log.md']);
    expect(filtered.files).toEqual(['src/app.ts']);
    expect(filtered.fileDiffs.has('specs/030/audit-log.md')).toBe(false);
    expect(filtered.fileDiffs.get('src/app.ts')).toBe('diff a');
  });

  it('filterDiffScope drops a whole excluded subtree (dir-prefix), keeps siblings', () => {
    const scope = {
      base: 'B',
      head: 'H',
      files: ['src/app.ts', 'specs/030/spec.md', 'specs/030/contracts/x.md', 'specs/031/spec.md'],
      fileDiffs: new Map([
        ['src/app.ts', 'a'],
        ['specs/030/spec.md', 'b'],
        ['specs/030/contracts/x.md', 'c'],
        ['specs/031/spec.md', 'd'],
      ]),
    };
    const filtered = filterDiffScope(scope, ['specs/030']);
    expect(filtered.files).toEqual(['src/app.ts', 'specs/031/spec.md']);
  });

  it('filterDiffScope with no exclusions returns the scope unchanged', () => {
    const scope = { base: 'B', head: 'H', files: ['a.ts'], fileDiffs: new Map([['a.ts', 'x']]) };
    expect(filterDiffScope(scope, [])).toBe(scope);
  });

  it('resolveImplementExclusion yields the own + other-feature audit-logs and caller excludePaths', () => {
    const root = '/install';
    const ex = resolveImplementExclusion(
      root,
      '/install/specs/030-feat',
      ['/install/specs/030-feat', '/install/specs/029-other'],
      ['/install/.stack-control/backlog'],
    );
    expect(ex.excludeDiffRels).toContain('specs/030-feat/audit-log.md');
    expect(ex.excludeDiffRels).toContain('specs/029-other/audit-log.md');
    expect(ex.excludeDiffRels).toContain('.stack-control/backlog');
    // The feature's own root is NOT double-listed as an "other" feature.
    expect(ex.otherFeatureRels).not.toContain('specs/030-feat');
  });
});
