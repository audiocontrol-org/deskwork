// TASK-357 (RED-first) — in a monorepo (git-root != installation-root), the per-phase
// checkpoint's audited files + hunk fingerprint must be INSTALLATION-relative, not
// git-root-relative. The un-relative output made computePhaseHunkBlocks' per-file
// `git diff` (cwd=installationRoot) match nothing → empty hunkBlocks → US7 hunk-freshness
// never engaged in-monorepo → whole-file fallback re-staled shared-file phases (the
// per-phase entanglement loop).
//
// On-disk git fixtures only (mkdtempSync + real `git init`/commits), per testing.md.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAuditedFiles } from '../../src/subcommands/govern.js';
import { computePhaseHunkBlocks } from '../../src/govern/checkpoint-state.js';

function git(repo: string, ...args: string[]): void {
  spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

function commitAll(repo: string, message: string): void {
  git(repo, 'add', '-A');
  spawnSync(
    'git',
    ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false',
      'commit', '-q', '--no-gpg-sign', '-m', message],
    { encoding: 'utf8' },
  );
}

describe('TASK-357 — audited files + hunk blocks are installation-relative in a monorepo', () => {
  it('resolveAuditedFiles returns installation-relative paths (git-root != installation-root)', () => {
    const root = mkdtempSync(join(tmpdir(), 'mono-'));
    const install = join(root, 'plugins', 'stack-control');
    try {
      mkdirSync(join(install, 'src'), { recursive: true });
      git(root, 'init', '-q');
      writeFileSync(join(install, 'src', 'feature.ts'), 'export const a = 1;\n');
      commitAll(root, 'base (pre-phase)');
      const base = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
      writeFileSync(join(install, 'src', 'feature.ts'), 'export const a = 1;\nexport const b = 2;\n');
      commitAll(root, 'phase change to src/feature.ts');

      const audited = resolveAuditedFiles(install, base, ['src/feature.ts']);
      // Installation-relative, NOT git-root-prefixed (plugins/stack-control/...).
      expect(audited).toEqual(['src/feature.ts']);

      // And the hunk fingerprint engages (non-empty) — the whole point of US7 in-monorepo.
      const blocks = computePhaseHunkBlocks(install, audited, base);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.every((b) => b.file === 'src/feature.ts')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
