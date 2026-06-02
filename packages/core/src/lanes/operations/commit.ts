/**
 * Shared lane-config commit helper. Atomic write helper for lane
 * config JSON files. Mirrors packages/core/src/sidecar/write.ts —
 * the "commit" in the function name refers to writing-to-disk, not
 * to anything git-related.
 *
 * Phase 6 Task 6.1 (graphical-entries). Centralizes the
 * Zod-validate-and-write-to-disk shape used by every mutating lane
 * operation (create, update, archive, restore). The journal-event
 * append is intentionally NOT bundled here — each verb's event
 * carries operation-specific details (changedFields, archivedAt
 * timestamp, etc.) and is awaited by the caller separately.
 *
 * The write is atomic via a tmp+rename pattern: a crash mid-write
 * leaves the tmp file (which is unlinked on rename failure) rather
 * than a truncated lane config that subsequent `loadLaneConfig`
 * reads would reject.
 *
 * The `verb` argument personalizes the error message so the operator
 * sees which operation failed validation.
 */

import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { laneConfigPath } from '../loader.ts';
import { LaneConfigSchema, type LaneConfig } from '../types.ts';

export interface CommitResult {
  readonly lane: LaneConfig;
  readonly path: string;
}

export function commitLaneConfig(
  projectRoot: string,
  id: string,
  candidate: LaneConfig,
  verb: string,
): CommitResult {
  const validated = LaneConfigSchema.safeParse(candidate);
  if (!validated.success) {
    throw new Error(
      `Cannot ${verb} lane "${id}": schema validation failed:\n`
      + validated.error.message,
    );
  }
  const path = laneConfigPath(projectRoot, id);
  const tmpPath = `${path}.${process.pid}.tmp`;
  const payload = JSON.stringify(validated.data, null, 2) + '\n';
  try {
    writeFileSync(tmpPath, payload, 'utf8');
    renameSync(tmpPath, path);
  } catch (err) {
    // Clean up the tmp file if rename failed — don't leak `.tmp`
    // files on disk. The catch is best-effort: an unlink failure
    // re-throws the ORIGINAL write/rename error so the operator
    // sees the root cause.
    try { unlinkSync(tmpPath); } catch { /* tmp absent — ignore */ }
    throw err;
  }
  return { lane: validated.data, path };
}
