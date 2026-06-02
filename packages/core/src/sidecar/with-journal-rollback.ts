/**
 * with-journal-rollback — compensating-write helper for the
 * sidecar-write + journal-append sequence the group mutators (and
 * structurally similar entry mutators) follow.
 *
 * AUDIT-20260530-93 (cross-model: AUDIT-BARRAGE-codex-P7T7.2). Every
 * group mutator wrote the sidecar BEFORE appending its `group-*`
 * journal event. A journal-append failure after a successful sidecar
 * write left the on-disk state mutated with no audit record — the
 * exact failure mode the doctor's `lane-config-missing-template`
 * repair branches closed via `snapshotLaneFile` / `restoreLaneFile`
 * (AUDIT-20260530-79) and that `bootstrapDefaultLaneIfMissing`
 * closed via the compensating-write pattern (AUDIT-20260530-13).
 *
 * This helper generalises that pattern for any
 * sidecar-write-followed-by-journal-append call site:
 *
 *   1. Snapshot the sidecar file state BEFORE mutating.
 *      - File exists  → record its byte body.
 *      - File absent  → record the `absent` marker (used by `create`
 *                       so a failed create rolls back to "no file
 *                       existed").
 *   2. Run the caller-supplied `mutate` callback, which performs
 *      the sidecar write + journal append.
 *   3. On thrown error from `mutate`: best-effort restore the
 *      snapshot (overwrite with the prior body OR delete the file
 *      if it was absent before), then rethrow the original error.
 *
 * The restore is intentionally best-effort: a restore-side failure
 * shouldn't mask the original journal-append error which IS the root
 * cause the operator needs to act on. The next doctor run will
 * re-detect any residual state regardless. Mirrors the swallow-and-
 * surface-original-error contract from `restoreLaneFile`.
 *
 * Sibling-relative imports per the project convention.
 */

import { readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { sidecarPath } from './paths.ts';

/**
 * Snapshot of a sidecar file at the moment `withJournalRollback`
 * starts. Two shapes:
 *   - `{ existed: true, body }`  — file existed; rollback overwrites
 *     with `body`.
 *   - `{ existed: false }`        — file did not exist; rollback
 *     deletes the file.
 *
 * The discriminator field is `existed` so the consumer doesn't have to
 * pattern-match on `body !== undefined`.
 */
type SidecarSnapshot =
  | { readonly existed: true; readonly body: string }
  | { readonly existed: false };

/**
 * Capture the current on-disk state of the sidecar at `path`.
 * Synchronous so the snapshot is taken before any async mutation can
 * race with it.
 */
function snapshotSidecar(path: string): SidecarSnapshot {
  if (!existsSync(path)) {
    return { existed: false };
  }
  const body = readFileSync(path, 'utf8');
  return { existed: true, body };
}

/**
 * Best-effort restore from a prior snapshot. Swallows any restore-
 * side error so the caller can surface the original mutate-side error
 * as the actionable root cause. See header for rationale.
 */
function restoreSidecar(path: string, snapshot: SidecarSnapshot): void {
  try {
    if (snapshot.existed) {
      writeFileSync(path, snapshot.body, 'utf8');
    } else {
      try {
        unlinkSync(path);
      } catch {
        // file may have been removed by another process; ignore
      }
    }
  } catch {
    // intentional swallow — see docblock
  }
}

/**
 * Run `mutate` (which performs sidecar write + journal append) under
 * compensating-write protection: snapshot the sidecar BEFORE the
 * callback, and on any thrown error from the callback restore the
 * snapshot before rethrowing.
 *
 * Caller passes the entry UUID so the helper resolves the sidecar
 * path through the same `sidecarPath` function the writer uses —
 * keeping the snapshot path and the write path locked together.
 *
 * The return value of `mutate` is passed through unchanged on
 * success so callers can use it for the function-level return value.
 */
export async function withJournalRollback<T>(
  projectRoot: string,
  uuid: string,
  mutate: () => Promise<T>,
): Promise<T> {
  const path = sidecarPath(projectRoot, uuid);
  const snapshot = snapshotSidecar(path);
  try {
    return await mutate();
  } catch (err) {
    restoreSidecar(path, snapshot);
    throw err;
  }
}
