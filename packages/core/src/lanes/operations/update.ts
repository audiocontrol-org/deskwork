/**
 * lane update — mutate a subset of fields on an existing lane config.
 *
 * Phase 6 Task 6.1 (graphical-entries). Accepts optional patches for
 * `name`, `pipelineTemplate`, and `contentDir`. The lane's `id`
 * cannot change (it's the filename). The `archivedAt` field is owned
 * by `archive` / `restore` and is not mutable through `update`.
 *
 * Cross-validation:
 *   - If `pipelineTemplate` is patched, the new template MUST resolve
 *     via `loadPipelineTemplate` before the write commits.
 *   - The assembled lane is re-validated against the Zod schema
 *     before the write.
 *
 * Refusal:
 *   - When no patch fields are supplied, the operation is a no-op and
 *     throws. Operators are required to specify what changed so the
 *     journal event records meaningful before/after deltas.
 *
 * Emits a `lane-update` journal event on success.
 */

import { appendJournalEvent } from '../../journal/append.ts';
import { loadPipelineTemplate } from '../../pipelines/loader.ts';
import { assertSafeContentDir, loadLaneConfig } from '../loader.ts';
import { type LaneConfig } from '../types.ts';
import { commitLaneConfig } from './commit.ts';

export interface UpdateLaneOptions {
  readonly id: string;
  readonly name?: string;
  readonly pipelineTemplate?: string;
  readonly contentDir?: string;
}

export interface UpdateLaneResult {
  readonly lane: LaneConfig;
  readonly path: string;
  readonly changedFields: readonly string[];
}

export async function updateLane(
  projectRoot: string,
  opts: UpdateLaneOptions,
): Promise<UpdateLaneResult> {
  const existing = loadLaneConfig(opts.id, projectRoot);

  const patches: Record<string, string> = {};
  if (opts.name !== undefined) patches['name'] = opts.name;
  if (opts.pipelineTemplate !== undefined) {
    patches['pipelineTemplate'] = opts.pipelineTemplate;
  }
  if (opts.contentDir !== undefined) {
    assertSafeContentDir(projectRoot, opts.contentDir);
    patches['contentDir'] = opts.contentDir;
  }

  const changedFields = Object.keys(patches);
  if (changedFields.length === 0) {
    throw new Error(
      `Cannot update lane "${opts.id}": no patch fields supplied. `
      + `Pass at least one of --name, --template, --content-dir.`,
    );
  }

  // Cross-validate the patched pipeline template up front so we don't
  // half-write a broken lane.
  if (patches['pipelineTemplate'] !== undefined) {
    try {
      loadPipelineTemplate(patches['pipelineTemplate'], projectRoot);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot update lane "${opts.id}": pipelineTemplate "${patches['pipelineTemplate']}" `
        + `does not resolve:\n${detail}`,
      );
    }
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const field of changedFields) {
    // `existing` is a LaneConfig — schema `.passthrough()` widens
    // the inferred type to accept arbitrary keys, so direct
    // property access via Reflect.get is sound without an
    // explicit cast and avoids `any`.
    before[field] = Reflect.get(existing, field);
    after[field] = patches[field];
  }

  const updated: LaneConfig = {
    ...existing,
    ...patches,
  };

  const { lane, path } = commitLaneConfig(projectRoot, opts.id, updated, 'update');

  await appendJournalEvent(projectRoot, {
    kind: 'lane-update',
    at: new Date().toISOString(),
    laneId: opts.id,
    details: {
      changedFields,
      before,
      after,
    },
  });

  return { lane, path, changedFields };
}
