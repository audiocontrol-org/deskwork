/**
 * plugins/dw-lifecycle/src/scope-discovery/util/atomic-write-file.ts
 *
 * Per AUDIT-20260530-04: precious append-only ledgers (the canonical
 * audit-log being the load-bearing one) must not be lost to a crash
 * mid-write. Node's `fs.writeFile` truncates the target before
 * writing the new content — if the process is interrupted between
 * the truncate and the full write (signal, disk-full, operator
 * Ctrl-C mid-hook), the canonical file is left truncated or empty.
 *
 * This helper writes to a sibling temp file in the SAME directory
 * as the target, then atomically renames it into place. Rename is
 * atomic on POSIX when both source and destination are on the same
 * filesystem — the same-directory choice is what guarantees that.
 * On crash, the operator finds either the old file untouched OR
 * the new file fully written, never a torn state.
 */

import { writeFile, rename as fsRename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

export interface AtomicWriteFileOpts {
  /**
   * Optional rename seam. Default: `fs.promises.rename`. Tests inject
   * a failing rename to exercise the cleanup branch (per
   * AUDIT-20260530-10 — pre-fix the "rename fails" test actually
   * tested the write-fail path because there was no way to inject
   * a real rename failure).
   */
  readonly rename?: (source: string, target: string) => Promise<void>;
}

export async function atomicWriteFile(
  filePath: string,
  content: string,
  opts: AtomicWriteFileOpts = {},
): Promise<void> {
  const dir = dirname(filePath);
  const base = basename(filePath);
  // Sibling temp file with a sufficiently-unique suffix so concurrent
  // writers (and crash-recovery scenarios) don't collide. The suffix
  // shape is deliberately `.tmp-<pid>-<ms>-<rand>` so tests + cleanup
  // tooling can match it via the `.tmp-` infix.
  const rand = Math.random().toString(36).slice(2, 10);
  const tmpPath = join(dir, `${base}.tmp-${process.pid}-${Date.now()}-${rand}`);
  // Per AUDIT-20260530-10: no try/catch around the write — the
  // pre-fix try/catch was a no-op (catch + immediately re-throw with
  // no added behavior). If the temp-file write fails (parent dir
  // missing, permissions, disk-full), let the error propagate
  // directly. The meaningful cleanup is only in the rename catch.
  await writeFile(tmpPath, content, 'utf8');
  const renameFn = opts.rename ?? fsRename;
  try {
    await renameFn(tmpPath, filePath);
  } catch (renameErr) {
    // rename failed (rare in practice; cross-device-link, target dir
    // vanished mid-operation, EPERM on a locked target). Clean up the
    // temp file so we don't leak `.tmp-*` artifacts next to the
    // precious file.
    await unlink(tmpPath).catch(() => {
      // Already gone, or unlink itself failed; the rename error is
      // the more actionable one to surface.
    });
    throw renameErr;
  }
}
