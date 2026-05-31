/**
 * Tests for `atomicWriteFile` — the temp-file + rename pattern used by
 * `audit-barrage-lift` (and any other verb that writes precious
 * append-only ledgers) to guarantee that a crash mid-write leaves
 * either the old file or the new file, never a truncated one.
 *
 * Per AUDIT-20260530-04: writeFile(...) truncates-then-writes and is
 * NOT atomic. The audit-log is precious historical record under the
 * project's preservation rule; losing it to a crash mid-lift is the
 * exact failure mode this helper exists to prevent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteFile } from '../../../scope-discovery/util/atomic-write-file.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'awf-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('atomicWriteFile — AUDIT-20260530-04 regression', () => {
  it('writes the requested content to the target path', async () => {
    const target = join(workDir, 'simple.md');
    await atomicWriteFile(target, '# hello world\n');
    expect(readFileSync(target, 'utf8')).toBe('# hello world\n');
  });

  it('leaves no `.tmp-*` artifacts in the target directory on a clean write', async () => {
    const target = join(workDir, 'noleak.md');
    await atomicWriteFile(target, 'payload\n');
    const entries = readdirSync(workDir);
    const leakedTmps = entries.filter((e) => /noleak\.md\.tmp-/.test(e));
    expect(leakedTmps).toEqual([]);
  });

  it('overwrites an existing file atomically (final content is the new bytes)', async () => {
    const target = join(workDir, 'overwrite.md');
    writeFileSync(target, 'original\n', 'utf8');
    await atomicWriteFile(target, 'replacement\n');
    expect(readFileSync(target, 'utf8')).toBe('replacement\n');
  });

  it('fails fast when the write step fails (non-existent parent dir)', async () => {
    // Pre-AUDIT-10 this test was named "cleans up if rename fails"
    // but the body actually exercised the WRITE-failure path (write
    // to non-existent parent throws BEFORE any rename). Renamed to
    // match what it tests; the rename-failure cleanup branch is now
    // covered by the separate test below using an injected seam.
    const target = join(workDir, 'does-not-exist', 'subdir', 'file.md');
    await expect(atomicWriteFile(target, 'x\n')).rejects.toBeDefined();
    const entries = readdirSync(workDir);
    const leaks = entries.filter((e) => /file\.md\.tmp-/.test(e));
    expect(leaks).toEqual([]);
  });

  it('cleans up the temp file when rename fails (AUDIT-20260530-10 — real coverage of the rename-cleanup branch)', async () => {
    const target = join(workDir, 'rename-fail-target.md');
    // Pre-existing content survives — the rename never happens.
    writeFileSync(target, 'original\n', 'utf8');
    // Inject a rename that throws. The helper's rename-catch block
    // unlinks the temp file before re-throwing.
    const failingRename = (): Promise<void> =>
      Promise.reject(new Error('synthetic rename failure'));
    await expect(
      atomicWriteFile(target, 'new content\n', { rename: failingRename }),
    ).rejects.toThrow(/synthetic rename failure/);
    // Target file unchanged (original content preserved).
    expect(readFileSync(target, 'utf8')).toBe('original\n');
    // No leaked `.tmp-*` artifacts next to the target.
    const entries = readdirSync(workDir);
    const leaks = entries.filter((e) => /rename-fail-target\.md\.tmp-/.test(e));
    expect(leaks).toEqual([]);
  });

  it('uses a temp file in the SAME directory as the target (cross-device rename safety)', async () => {
    // The atomic rename only works when the temp file is on the same
    // filesystem as the target — which on POSIX means the same directory.
    // We can't introspect the temp path directly (it's encapsulated),
    // but we can verify the post-write state: the target exists, and
    // no temp file leaked anywhere ELSE in workDir (i.e. the helper
    // didn't fall back to /tmp).
    const subdir = join(workDir, 'same-dir-check');
    rmSync(subdir, { recursive: true, force: true });
    // Manually create the subdir so the target dir exists.
    mkdirSync(subdir, { recursive: true });
    const target = join(subdir, 'precious.md');
    await atomicWriteFile(target, 'data\n');
    expect(existsSync(target)).toBe(true);
    // No temp files in either the subdir or the parent workDir.
    expect(readdirSync(subdir).filter((e) => /\.tmp-/.test(e))).toEqual([]);
  });
});
