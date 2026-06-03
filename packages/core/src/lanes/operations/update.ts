/**
 * lane update — mutate a subset of fields on an existing lane config.
 *
 * Phase 6 Task 6.1 (graphical-entries). Accepts optional patches for
 * `name`, `pipelineTemplate`, `scaffoldDefaults`, and `host`. The
 * lane's `id` cannot change (it's the filename). The `archivedAt`
 * field is owned by `archive` / `restore` and is not mutable through
 * `update`. Per Phase 39 (sites→lanes retirement) a lane carries no
 * `contentDir` — the former `--content-dir` patch is replaced by
 * `scaffoldDefaults` (add-time directories, keyed by artifact kind).
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
import { assertSafeScaffoldDir, loadLaneConfig } from '../loader.ts';
import { type ArtifactKind, type LaneConfig } from '../types.ts';
import { commitLaneConfig } from './commit.ts';

export interface UpdateLaneOptions {
  readonly id: string;
  readonly name?: string;
  readonly pipelineTemplate?: string;
  /**
   * Replacement scaffold-default directories, keyed by artifact kind.
   * Replaces the whole `scaffoldDefaults` map when supplied (a lane
   * carries no `contentDir` — Phase 39 sites→lanes retirement).
   */
  readonly scaffoldDefaults?: Partial<Record<ArtifactKind, string>>;
  /** Replacement website host. */
  readonly host?: string;
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

  const patches: Record<string, unknown> = {};
  if (opts.name !== undefined) patches['name'] = opts.name;
  if (opts.pipelineTemplate !== undefined) {
    patches['pipelineTemplate'] = opts.pipelineTemplate;
  }
  if (opts.scaffoldDefaults !== undefined) {
    for (const dir of Object.values(opts.scaffoldDefaults)) {
      if (dir !== undefined) assertSafeScaffoldDir(projectRoot, dir);
    }
    patches['scaffoldDefaults'] = opts.scaffoldDefaults;
  }
  if (opts.host !== undefined) {
    patches['host'] = opts.host;
  }

  const changedFields = Object.keys(patches);
  if (changedFields.length === 0) {
    throw new Error(
      `Cannot update lane "${opts.id}": no patch fields supplied. `
      + `Pass at least one of --name, --template, --scaffold-default, --host.`,
    );
  }

  // Cross-validate the patched pipeline template up front so we don't
  // half-write a broken lane.
  const patchedTemplate = patches['pipelineTemplate'];
  if (typeof patchedTemplate === 'string') {
    try {
      loadPipelineTemplate(patchedTemplate, projectRoot);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot update lane "${opts.id}": pipelineTemplate "${patchedTemplate}" `
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

  // Build the patched lane from typed options rather than spreading the
  // `unknown`-valued `patches` bag, so the merge stays type-safe (no
  // `as` cast). `commitLaneConfig` re-validates the result via Zod.
  const updated: LaneConfig = {
    ...existing,
    ...(opts.name !== undefined && { name: opts.name }),
    ...(opts.pipelineTemplate !== undefined && {
      pipelineTemplate: opts.pipelineTemplate,
    }),
    ...(opts.scaffoldDefaults !== undefined && {
      scaffoldDefaults: opts.scaffoldDefaults,
    }),
    ...(opts.host !== undefined && { host: opts.host }),
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
