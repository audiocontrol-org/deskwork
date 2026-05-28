/**
 * Shared lane-config commit helper.
 *
 * Phase 6 Task 6.1 (graphical-entries). Centralizes the
 * Zod-validate-and-write-to-disk shape used by every mutating lane
 * operation (create, update, archive, restore). The journal-event
 * append is intentionally NOT bundled here — each verb's event
 * carries operation-specific details (changedFields, archivedAt
 * timestamp, etc.) and is awaited by the caller separately.
 *
 * The `verb` argument personalizes the error message so the operator
 * sees which operation failed validation.
 */

import { writeFileSync } from 'node:fs';
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
  writeFileSync(path, JSON.stringify(validated.data, null, 2) + '\n', 'utf8');
  return { lane: validated.data, path };
}
