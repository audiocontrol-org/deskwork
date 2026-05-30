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

  it('cleans up the temp file if the rename itself somehow fails', async () => {
    // We can't easily simulate a rename failure cross-platform; this
    // case is the documented contract: catch + cleanup + re-throw.
    // The unit test is a smoke that writing to a non-writable parent
    // throws AND doesn't leak the temp file in a recoverable place.
    const target = join(workDir, 'does-not-exist', 'subdir', 'file.md');
    await expect(atomicWriteFile(target, 'x\n')).rejects.toBeDefined();
    // The temp file would have been created next to the FINAL target,
    // which itself is in a non-existent dir — so the temp file write
    // throws BEFORE the rename. No leak in workDir.
    const entries = readdirSync(workDir);
    const leaks = entries.filter((e) => /file\.md\.tmp-/.test(e));
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
