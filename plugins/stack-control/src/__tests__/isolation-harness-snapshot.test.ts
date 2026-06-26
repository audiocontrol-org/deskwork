// 026 H9 — the shared isolation-snapshot primitive (`snapshotTree` + `diffSnapshots`)
// is the single, robust basis for every "this verb writes nothing here" guard. These
// tests pin the two blind spots the migrated findings name against the prior divergent
// `no-backend-writes.test.ts` copy: AUDIT-20260618-149/153 (same-size in-place edits)
// and -155 (deletions). -157 is the DRY consolidation this primitive enables.

import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diffSnapshots, snapshotTree } from './_isolation-harness.js';

describe('snapshotTree — content-hash, removal-aware tree snapshot (026 H9)', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });
  const mk = (): string => mkdtempSync(join(tmpdir(), 'snap-tree-'));

  it('detects a DELETION — a path present before, absent after (the AUDIT-155 blind spot)', () => {
    root = mk();
    writeFileSync(join(root, 'keep.txt'), 'keep', 'utf8');
    writeFileSync(join(root, 'gone.txt'), 'gone', 'utf8');
    const before = snapshotTree(root);
    rmSync(join(root, 'gone.txt'));
    expect(diffSnapshots(before, snapshotTree(root))).toEqual(['removed: gone.txt']);
  });

  it('detects a SAME-SIZE, SAME-MTIME in-place edit (the size+mtime basis would miss it — AUDIT-149/153)', () => {
    root = mk();
    const f = join(root, 'a.txt');
    writeFileSync(f, 'AAAA', 'utf8');
    const before = snapshotTree(root);
    const { atimeMs, mtimeMs } = statSync(f);
    writeFileSync(f, 'BBBB', 'utf8'); // identical byte length, different content
    utimesSync(f, atimeMs / 1000, mtimeMs / 1000); // restore mtime → ONLY content differs
    expect(diffSnapshots(before, snapshotTree(root))).toEqual(['modified: a.txt']);
  });

  it('detects a creation and ignores .git churn', () => {
    root = mk();
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: x', 'utf8');
    const before = snapshotTree(root);
    writeFileSync(join(root, 'new.txt'), 'new', 'utf8');
    writeFileSync(join(root, '.git', 'index'), 'churn', 'utf8'); // .git is excluded by construction
    expect(diffSnapshots(before, snapshotTree(root))).toEqual(['created: new.txt']);
  });

  it('honors exemptRel — a listed dir excludes its whole subtree', () => {
    root = mk();
    const before = snapshotTree(root, ['ignored']);
    mkdirSync(join(root, 'ignored'));
    writeFileSync(join(root, 'ignored', 'x.txt'), 'x', 'utf8');
    expect(diffSnapshots(before, snapshotTree(root, ['ignored']))).toEqual([]);
  });
});
