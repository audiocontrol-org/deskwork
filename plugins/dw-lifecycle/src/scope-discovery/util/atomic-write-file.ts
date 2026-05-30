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

import { writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

export async function atomicWriteFile(
  filePath: string,
  content: string,
): Promise<void> {
  const dir = dirname(filePath);
  const base = basename(filePath);
  // Sibling temp file with a sufficiently-unique suffix so concurrent
  // writers (and crash-recovery scenarios) don't collide. The suffix
  // shape is deliberately `.tmp-<pid>-<ms>-<rand>` so tests + cleanup
  // tooling can match it via the `.tmp-` infix.
  const rand = Math.random().toString(36).slice(2, 10);
  const tmpPath = join(dir, `${base}.tmp-${process.pid}-${Date.now()}-${rand}`);
  try {
    await writeFile(tmpPath, content, 'utf8');
  } catch (writeErr) {
    // The temp-file write failed (typically: target directory doesn't
    // exist, permissions, disk-full). No rename has happened. Bubble.
    throw writeErr;
  }
  try {
    await rename(tmpPath, filePath);
  } catch (renameErr) {
    // rename failed (rare; same-filesystem cross-device fallback hit,
    // or target dir vanished). Clean up the temp file so we don't
    // leak orphaned `.tmp-*` artifacts next to precious files.
    await unlink(tmpPath).catch(() => {
      // Already gone, or unlink itself failed; the rename error is
      // the more actionable one to surface.
    });
    throw renameErr;
  }
}
