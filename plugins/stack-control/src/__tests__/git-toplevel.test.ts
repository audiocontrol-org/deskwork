// AUDIT-20260611-04 — shared git-toplevel derivation helper.
//
// One diff introduced FOUR private spawnSync('git', ['-C', <base>,
// 'rev-parse', '--show-toplevel']) derivations with divergent
// post-processing (installation.ts, feature-root.ts, govern.ts,
// payload-implement.ts). The divergence was load-bearing: govern.ts's
// copy compared toplevel !== base by RAW STRING, missing macOS
// /var vs /private/var realpath aliasing, so a symlinked spelling of
// the installation root pushed the same CLAUDE.md twice as two
// "distinct" bases. This suite pins the ONE shared helper's contract;
// the four sites all adopt it.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deriveDistinctGitToplevel,
  deriveGitToplevel,
} from '../scope-discovery/util/git-toplevel.js';

function git(cwd: string, args: readonly string[]): void {
  const r = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
  }
}

interface RepoFixture {
  /** The repo root as mkdtempSync spelled it (on macOS: /var/..., a symlink). */
  readonly repoRoot: string;
  /** A subdirectory inside the repo. */
  readonly subdir: string;
  /** A directory that is NOT inside any git work tree. */
  readonly nonGitDir: string;
  readonly cleanup: () => void;
}

function makeRepoFixture(): RepoFixture {
  const base = mkdtempSync(join(tmpdir(), 'git-toplevel-'));
  const repoRoot = join(base, 'repo');
  mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ['init', '--quiet']);
  git(repoRoot, ['config', 'user.email', 'test@example.com']);
  git(repoRoot, ['config', 'user.name', 'Test']);
  git(repoRoot, ['commit', '--allow-empty', '--quiet', '-m', 'init']);
  const subdir = join(repoRoot, 'nested', 'deeper');
  mkdirSync(subdir, { recursive: true });
  const nonGitDir = join(base, 'plain');
  mkdirSync(nonGitDir, { recursive: true });
  return {
    repoRoot,
    subdir,
    nonGitDir,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

describe('deriveGitToplevel (raw derivation)', () => {
  it('returns the repo root for a subdirectory of a git work tree', () => {
    const f = makeRepoFixture();
    try {
      const top = deriveGitToplevel(f.subdir);
      expect(top).not.toBeNull();
      // git prints the symlink-resolved toplevel (macOS /var → /private/var);
      // compare realpaths, not raw spellings.
      expect(realpathSync(top ?? '')).toBe(realpathSync(f.repoRoot));
    } finally {
      f.cleanup();
    }
  });

  it('returns the repo root even when base IS the repo root (no distinctness filter)', () => {
    const f = makeRepoFixture();
    try {
      const top = deriveGitToplevel(f.repoRoot);
      expect(top).not.toBeNull();
      expect(realpathSync(top ?? '')).toBe(realpathSync(f.repoRoot));
    } finally {
      f.cleanup();
    }
  });

  it('returns null for a directory outside any git work tree', () => {
    const f = makeRepoFixture();
    try {
      expect(deriveGitToplevel(f.nonGitDir)).toBeNull();
    } finally {
      f.cleanup();
    }
  });
});

describe('deriveDistinctGitToplevel (realpath-aware distinctness)', () => {
  it('returns null when base IS the toplevel — even via a symlinked spelling', () => {
    const f = makeRepoFixture();
    try {
      // On macOS tmpdir() gives /var/... which is a symlink to
      // /private/var/...: f.repoRoot is the /var spelling while git
      // prints the /private/var spelling. The raw strings differ; the
      // realpaths are identical. A raw-string comparison (the govern.ts
      // bug this finding closes) would wrongly report "distinct" here.
      expect(deriveDistinctGitToplevel(f.repoRoot)).toBeNull();
      // And via the fully-resolved spelling too.
      expect(deriveDistinctGitToplevel(realpathSync(f.repoRoot))).toBeNull();
    } finally {
      f.cleanup();
    }
  });

  it('returns the toplevel for a genuine subdirectory', () => {
    const f = makeRepoFixture();
    try {
      const top = deriveDistinctGitToplevel(f.subdir);
      expect(top).not.toBeNull();
      expect(realpathSync(top ?? '')).toBe(realpathSync(f.repoRoot));
    } finally {
      f.cleanup();
    }
  });

  it('returns null for a directory outside any git work tree', () => {
    const f = makeRepoFixture();
    try {
      expect(deriveDistinctGitToplevel(f.nonGitDir)).toBeNull();
    } finally {
      f.cleanup();
    }
  });
});
