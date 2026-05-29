/**
 * pipeline delete — remove a project-override pipeline template JSON.
 *
 * Phase 6 Task 6.2 (graphical-entries). Refusal-heavy:
 *
 *   - Plugin presets are read-only. The operator should run
 *     `customize pipeline <id>` to create an override, then edit it.
 *   - The override is referenced by one or more lanes' `pipelineTemplate`
 *     field. Refused unless `--reassign-lanes-to <other-id>` is passed,
 *     in which case every dependent lane is re-bound to `<other-id>`
 *     (which must itself resolve via `loadPipelineTemplate`) before
 *     the override JSON is unlinked.
 *
 * The `--reassign-lanes-to` path is the operator's explicit escape
 * hatch: stage-compatibility between the doomed template's stages and
 * the replacement template is the operator's problem. Entries keep
 * their `currentStage` verbatim; if the new template lacks one of the
 * stages an entry occupies, doctor will surface the mismatch on the
 * next audit. Reassign is a forcing function, not a stage-rewrite.
 *
 * Emits a `pipeline-delete` journal event on success. `reassignedLanes`
 * carries the list of lane re-bindings (empty when no lanes
 * referenced the doomed template).
 */

import { existsSync, unlinkSync } from 'node:fs';
import { appendJournalEvent } from '../../journal/append.ts';
import {
  listLaneConfigs,
  loadLaneConfig,
} from '../../lanes/loader.ts';
import { commitLaneConfig } from '../../lanes/operations/commit.ts';
import type { LaneConfig } from '../../lanes/types.ts';
import {
  hasPipelineOverride,
  isPluginPresetPipeline,
  loadPipelineTemplate,
  pipelineOverridePath,
} from '../loader.ts';

export interface DeletePipelineOptions {
  readonly id: string;
  readonly reassignLanesTo?: string;
}

export interface DeletedPipelineResult {
  readonly purgedPath: string;
  readonly reassignedLanes: readonly {
    readonly laneId: string;
    readonly from: string;
    readonly to: string;
  }[];
}

export async function deletePipeline(
  projectRoot: string,
  opts: DeletePipelineOptions,
): Promise<DeletedPipelineResult> {
  // Plugin-preset refusal fires before override-presence so the
  // diagnostic names the right surface (the preset's read-only-ness)
  // rather than "missing override."
  if (
    isPluginPresetPipeline(opts.id)
    && !hasPipelineOverride(projectRoot, opts.id)
  ) {
    throw new Error(
      `Cannot delete pipeline "${opts.id}": "${opts.id}" is a built-in `
      + `plugin preset and cannot be deleted. Run `
      + `"deskwork customize pipeline ${opts.id}" to create a project `
      + `override, then edit it.`,
    );
  }

  if (!hasPipelineOverride(projectRoot, opts.id)) {
    throw new Error(
      `Cannot delete pipeline "${opts.id}": no project override exists at `
      + `${pipelineOverridePath(projectRoot, opts.id)}.`,
    );
  }

  // Enumerate dependent lanes. We include archived ones — an archived
  // lane still binds an entry's pipelineTemplate at resolve time, so
  // deleting the template would break the binding even though the
  // lane is hidden from the dashboard.
  const allLaneIds = listLaneConfigs(projectRoot, { includeArchived: true });
  const dependents: { id: string; config: LaneConfig }[] = [];
  for (const laneId of allLaneIds) {
    try {
      const cfg = loadLaneConfig(laneId, projectRoot);
      if (cfg.pipelineTemplate === opts.id) {
        dependents.push({ id: laneId, config: cfg });
      }
    } catch {
      // Malformed lane config: skip. Doctor will surface the issue
      // separately; we don't want to block the pipeline-delete
      // diagnostic with an unrelated lane-config error.
      continue;
    }
  }

  if (dependents.length > 0 && opts.reassignLanesTo === undefined) {
    const sample = dependents.slice(0, 5).map((d) => d.id);
    const remainder = dependents.length - sample.length;
    const suffix = remainder > 0 ? `, +${remainder} more` : '';
    throw new Error(
      `Cannot delete pipeline "${opts.id}": ${dependents.length} `
      + `${dependents.length === 1 ? 'lane references' : 'lanes reference'} `
      + `it (${sample.join(', ')}${suffix}). Either rebind each lane with `
      + `"deskwork lane update <lane> --template <other>", or force via `
      + `"deskwork pipeline delete ${opts.id} --reassign-lanes-to <other-id>".`,
    );
  }

  // If reassign was requested, validate the target template exists
  // BEFORE we touch any lane on disk. The two-phase shape (verify, then
  // rewrite) makes a partial-failure mid-walk less likely; a tmp+rename
  // per lane keeps each individual write atomic.
  if (
    opts.reassignLanesTo !== undefined
    && opts.reassignLanesTo.length > 0
  ) {
    if (opts.reassignLanesTo === opts.id) {
      throw new Error(
        `Cannot delete pipeline "${opts.id}": --reassign-lanes-to value `
        + `is the same id being deleted.`,
      );
    }
    try {
      loadPipelineTemplate(opts.reassignLanesTo, projectRoot);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot delete pipeline "${opts.id}": replacement template `
        + `"${opts.reassignLanesTo}" does not resolve:\n${detail}`,
      );
    }
  }

  const reassigned: { laneId: string; from: string; to: string }[] = [];
  if (
    opts.reassignLanesTo !== undefined
    && opts.reassignLanesTo.length > 0
  ) {
    for (const { id: laneId, config } of dependents) {
      const updated: LaneConfig = {
        ...config,
        pipelineTemplate: opts.reassignLanesTo,
      };
      commitLaneConfig(projectRoot, laneId, updated, 'pipeline-delete reassign');
      reassigned.push({
        laneId,
        from: opts.id,
        to: opts.reassignLanesTo,
      });
    }
  }

  // Unlink the override. We use existsSync as a final guard so a race
  // (the file disappearing between the early hasPipelineOverride check
  // and the unlink) surfaces as a clear "already deleted" error rather
  // than ENOENT bubble-through.
  const path = pipelineOverridePath(projectRoot, opts.id);
  if (!existsSync(path)) {
    throw new Error(
      `Cannot delete pipeline "${opts.id}": override at ${path} disappeared `
      + `between refusal-check and unlink (concurrent removal?).`,
    );
  }
  unlinkSync(path);

  await appendJournalEvent(projectRoot, {
    kind: 'pipeline-delete',
    at: new Date().toISOString(),
    pipelineId: opts.id,
    details: {
      purgedPath: path,
      reassignedLanes: reassigned,
    },
  });

  return { purgedPath: path, reassignedLanes: reassigned };
}
