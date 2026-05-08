/**
 * Snapshot the entry's current `index.md` to its scrapbook on stage
 * approve (Issue #222 — Option B + hybrid refinement).
 *
 * Behavior contract (called from `approveEntryStage` BEFORE any sidecar
 * mutation, so a kill-power between snapshot and sidecar-write leaves
 * the snapshot durable on disk):
 *
 *   1. Resolve the entry's `<dir>/index.md` from `dirname(artifactPath)`.
 *      `dirname` is the keying field — `artifactPath` itself may already
 *      be `<dir>/index.md` (the common case post-T1) or some other
 *      per-stage file (legacy entries pre-doctor migration).
 *   2. If `index.md` doesn't exist on disk: skip (no content to
 *      preserve; common at Ideas where only `idea.md` exists).
 *   3. If `<dir>/scrapbook/<priorStage>.md` already exists with the
 *      same content as `index.md`: no-op (idempotent — re-approve
 *      after a `repair` should not error).
 *   4. If `<dir>/scrapbook/<priorStage>.md` exists with DIFFERENT
 *      content: refuse with a clear error. The fix path is operator
 *      resolution (they likely hand-edited a prior snapshot); silent
 *      overwrite would erase prior approved history.
 *   5. Atomic write: write content to `<target>.<pid>.tmp`, then
 *      `rename` to `<target>`. Mirrors `writeSidecar`'s pattern in
 *      `packages/core/src/sidecar/write.ts`.
 *
 * Stage-name-in-filename is lowercase for consistency with the existing
 * `scrapbook/outline.md` / `scrapbook/idea.md` / `scrapbook/plan.md`
 * convention. `Drafting` → `scrapbook/drafting.md`.
 */

import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { Entry, Stage } from '../schema/entry.ts';

export interface SnapshotResult {
  /** True when a snapshot file was written (or already matched on disk). */
  readonly snapshotted: boolean;
  /** Absolute path to the snapshot target (when `snapshotted`). */
  readonly snapshotPath?: string;
  /** Reason for skip when `snapshotted` is false. */
  readonly skipReason?: 'no-index-md' | 'no-snapshot-dir';
}

function fileExists(absPath: string): Promise<boolean> {
  return stat(absPath).then(
    (s) => s.isFile(),
    () => false,
  );
}

/**
 * Atomic write via tmp-file + rename (same defense as `writeSidecar`).
 * The tmp filename embeds the PID so concurrent processes don't clobber
 * each other's tmp state mid-rename.
 */
async function atomicWrite(absPath: string, content: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, content);
  await rename(tmpPath, absPath);
}

/**
 * Snapshot the entry's `index.md` into `scrapbook/<priorStage>.md`.
 *
 * `projectRoot` is the absolute project root. `entry.artifactPath` is
 * resolved relative to it. `priorStage` is the stage being graduated
 * AWAY FROM (the stage whose content the snapshot preserves).
 *
 * Throws when a prior snapshot exists with conflicting content. Returns
 * a `{ snapshotted: false }` result for legitimate skips (no `index.md`
 * on disk, or no `artifactPath` on the sidecar).
 */
export async function snapshotIndexForStage(
  projectRoot: string,
  entry: Entry,
  priorStage: Stage,
): Promise<SnapshotResult> {
  if (!entry.artifactPath) {
    // Legacy entries without an artifactPath: no anchor for the
    // snapshot dir. The doctor migration rule
    // (`legacy-stage-artifact-path`) sets `artifactPath` to
    // `<dir>/index.md`; once it runs, this branch becomes unreachable.
    return { snapshotted: false, skipReason: 'no-snapshot-dir' };
  }
  const absArtifact = join(projectRoot, entry.artifactPath);
  // Resolve the entry's "document directory":
  //  - When artifactPath ends `<dir>/<file>.md`, the doc dir is <dir>.
  //  - When artifactPath ends `<dir>/scrapbook/<file>.md` (legacy
  //    per-stage shape), the doc dir is <dir> — i.e. the scrapbook's
  //    parent. We strip one extra level so snapshots land in
  //    `<dir>/scrapbook/`, not `<dir>/scrapbook/scrapbook/`.
  const dir =
    basename(dirname(absArtifact)) === 'scrapbook'
      ? dirname(dirname(absArtifact))
      : dirname(absArtifact);
  const indexPath = join(dir, 'index.md');

  if (!(await fileExists(indexPath))) {
    return { snapshotted: false, skipReason: 'no-index-md' };
  }
  const content = await readFile(indexPath, 'utf8');
  const targetPath = join(
    dir,
    'scrapbook',
    `${priorStage.toLowerCase()}.md`,
  );

  if (await fileExists(targetPath)) {
    const existing = await readFile(targetPath, 'utf8');
    if (existing === content) {
      // Idempotent re-approve — same content already on disk.
      return { snapshotted: true, snapshotPath: targetPath };
    }
    throw new Error(
      `snapshotIndexForStage refused: ${targetPath} already exists with ` +
        `different content; refusing to overwrite a prior approved ` +
        `snapshot. Resolve the conflict (delete or rename the existing ` +
        `snapshot file) before re-running approve.`,
    );
  }

  await atomicWrite(targetPath, content);
  return { snapshotted: true, snapshotPath: targetPath };
}
