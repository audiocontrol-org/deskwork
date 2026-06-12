// RED-first (govern consolidation): the implement-mode payload assembler ports
// govern.sh's `git diff <base>` + untracked-fold logic. Each assertion pins a
// ported edge-case fix:
//   - AUDIT-20260605-01: untracked-but-not-ignored files ARE folded.
//   - AUDIT-20260605-06: binary files are SKIPPED (never shipped off-box).
//   - AUDIT-20260605-12: an over-budget early file is skipped but SMALLER later
//     files still fold (continue-not-break).
//   - empty-diff handling: an empty diff is reported (stderr note), not fatal.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleImplementPayload } from '../govern/payload-implement.js';

function initRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-impl-'));
  const run = (args: string[]) =>
    spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  run(['init', '-q']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'Test']);
  // Establish a base commit so HEAD~1 resolves.
  writeFileSync(join(repo, 'seed.txt'), 'seed\n');
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'seed']);
  return repo;
}

function commit(repo: string, msg: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repo, 'commit', '-q', '-m', msg], { encoding: 'utf8' });
}

describe('assembleImplementPayload (port of govern.sh diff+untracked-fold)', () => {
  it('captures the committed diff against the base', () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, 'src.ts'), 'export const a = 1;\n');
      commit(repo, 'add src');
      const r = assembleImplementPayload({ installationRoot: repo, base: 'HEAD~1' });
      expect(r.diff).toContain('export const a = 1;');
      expect(r.commitSubjects).toMatch(/add src/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('folds untracked-but-not-ignored files (AUDIT-20260605-01)', () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, 'newmod.ts'), 'export const fresh = true;\n');
      const r = assembleImplementPayload({ installationRoot: repo, base: 'HEAD~1' });
      expect(r.diff).toContain('export const fresh = true;');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('skips untracked binary files (AUDIT-20260605-06)', () => {
    const repo = initRepo();
    try {
      // A NUL byte makes grep -I treat the file as binary.
      writeFileSync(join(repo, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0xff]));
      writeFileSync(join(repo, 'text.ts'), 'export const t = 1;\n');
      const r = assembleImplementPayload({ installationRoot: repo, base: 'HEAD~1' });
      expect(r.diff).toContain('export const t = 1;');
      expect(r.skippedBinary).toContain('blob.bin');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('over-budget early file is skipped but smaller later files still fold (AUDIT-20260605-12, continue-not-break)', () => {
    const repo = initRepo();
    try {
      // `git ls-files --others` emits sorted paths: a-big sorts before z-small.
      writeFileSync(join(repo, 'a-big.ts'), 'x'.repeat(200) + '\n');
      writeFileSync(join(repo, 'z-small.ts'), 'export const small = 1;\n');
      const r = assembleImplementPayload({ installationRoot: repo, base: 'HEAD~1', budgetBytes: 100 });
      // The big file is over the 100-byte budget → skipped (logged, not silent).
      expect(r.skippedOverBudget).toContain('a-big.ts');
      // The smaller later file still folds (continue, not break).
      expect(r.diff).toContain('export const small = 1;');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('empty diff (no changes against base) is reported, not fatal', () => {
    const repo = initRepo();
    try {
      const r = assembleImplementPayload({ installationRoot: repo, base: 'HEAD' });
      expect(r.diff).toBe('');
      expect(r.empty).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
