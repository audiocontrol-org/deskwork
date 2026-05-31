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
 *
 * Sidecar cleanup (reviewer fix #3): when the pipeline is deleted, the
 * rename-migration sidecar at
 * `<projectRoot>/.deskwork/pipelines/migrations/<id>.json` is also
 * unlinked. Leaving the migration on disk would be inherited by a
 * subsequent `pipeline create <same-id>` and confuse the doctor-side
 * reader. The sidecar may not exist (the pipeline never had a
 * `--rename-stage` applied); the cleanup is gated on `existsSync`.
 *
 * Partial-failure recovery (reviewer fix #6): the dependent-lane
 * rewrites are NOT atomic across lanes. If a lane write fails mid-
 * walk, the operator can re-run the same delete command — already-
 * rebound lanes are idempotent at the data level (the lane already
 * carries the replacement `pipelineTemplate`, so re-writing with the
 * same content is a no-op data-wise). The iteration continues with
 * the remaining lanes; if the first run reached the unlink step and
 * the pipeline JSON is already gone, the second run surfaces a clean
 * "no project override exists" diagnostic after any remaining lane
 * rewrites are still applied because we read lane state before the
 * pipeline-existence check.
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
  assertSafePipelineId,
  hasPipelineOverride,
  isPluginPresetPipeline,
  loadPipelineTemplate,
  pipelineMigrationPath,
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
  // Reviewer-fix #2: validate the id BEFORE any filesystem path is
  // resolved from it. Refuses charset violations and any id whose
  // resolved path would escape `.deskwork/pipelines/`. Closes the
  // same path-traversal exposure Task 6.1 closed for lanes.
  assertSafePipelineId(projectRoot, opts.id);

  // AUDIT-20260530-55 (cross-model: AUDIT-BARRAGE-claude-P6-1):
  // empty-string `reassignLanesTo` is semantically equivalent to "no
  // reassign target" — collapse the value to either a non-empty
  // string or `undefined` and use the normalized form everywhere the
  // rest of the function previously checked `undefined`-vs-`length > 0`.
  // Without this normalization, an empty value slipped past the
  // dependent-lane refusal guard (`reassignLanesTo === undefined`)
  // AND the validation/rebind block (`reassignLanesTo.length > 0`),
  // causing the override to be unlinked while every dependent lane
  // was left pointing at a now-missing template. The CLI boundary
  // also normalizes empty-string to `undefined` (defense-in-depth —
  // both layers reject the value).
  const reassignTarget: string | undefined =
    opts.reassignLanesTo !== undefined && opts.reassignLanesTo.length > 0
      ? opts.reassignLanesTo
      : undefined;

  // Reviewer-fix #2 (continued): also validate the replacement id so
  // a malicious `--reassign-lanes-to ../../etc/foo` can't slip
  // through the lane write path. The lanes module's
  // `assertSafeLaneId` validates the lane id (path containment) but
  // the *pipeline id we write into the lane's `pipelineTemplate`
  // field* is data, not a filename, so it never reaches a path-
  // validation site on its own. Enforce the charset here so the
  // value persisted into every dependent lane's JSON conforms.
  if (reassignTarget !== undefined) {
    assertSafePipelineId(projectRoot, reassignTarget);
  }

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

  if (dependents.length > 0 && reassignTarget === undefined) {
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
  if (reassignTarget !== undefined) {
    if (reassignTarget === opts.id) {
      throw new Error(
        `Cannot delete pipeline "${opts.id}": --reassign-lanes-to value `
        + `is the same id being deleted.`,
      );
    }
    try {
      loadPipelineTemplate(reassignTarget, projectRoot);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot delete pipeline "${opts.id}": replacement template `
        + `"${reassignTarget}" does not resolve:\n${detail}`,
      );
    }
  }

  const reassigned: { laneId: string; from: string; to: string }[] = [];
  if (reassignTarget !== undefined) {
    for (const { id: laneId, config } of dependents) {
      const updated: LaneConfig = {
        ...config,
        pipelineTemplate: reassignTarget,
      };
      commitLaneConfig(projectRoot, laneId, updated, 'pipeline-delete reassign');
      reassigned.push({
        laneId,
        from: opts.id,
        to: reassignTarget,
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

  // Reviewer-fix #3: clean up the rename-migration sidecar if one
  // exists. Leaving it behind would let a subsequent
  // `pipeline create <same-id>` inherit a stale audit trail and
  // confuse the doctor-side reader. The sidecar is optional (the
  // pipeline may never have been --rename-stage'd), so guard on
  // existsSync.
  const migrationPath = pipelineMigrationPath(projectRoot, opts.id);
  if (existsSync(migrationPath)) {
    unlinkSync(migrationPath);
  }

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
