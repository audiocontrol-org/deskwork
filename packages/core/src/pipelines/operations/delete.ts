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
 * Partial-failure recovery (AUDIT-20260530-63, cross-model:
 * AUDIT-BARRAGE-codex-P6-1): the dependent-lane rebind loop +
 * override unlink + journal append is wrapped in a stage-then-commit
 * transaction. Before the rebind loop runs, we snapshot every
 * dependent lane's original config into an in-memory map. The rebind
 * loop, the override unlink, and the journal append are wrapped in
 * try/catch; on any failure during rebind OR unlink, we restore each
 * already-rebound lane from snapshot, then re-throw the original
 * error. Journal-append failure AFTER the override has been unlinked
 * is best-effort: the template is already gone and chasing the
 * journal write by re-creating it would muddy the failure shape; we
 * surface the original error and accept the missing journal event
 * (the operator sees a clear error message naming the missing event).
 *
 * Pre-fix behavior left already-rebound lanes pointing at the
 * replacement template while the doomed override still existed on
 * disk — a silent partial-state failure the operator would discover
 * only by inspecting individual lane configs.
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

  // AUDIT-20260530-63: snapshot every dependent lane's original
  // config BEFORE any mutation runs. The snapshot is the source of
  // truth for the rollback path. We snapshot from the `dependents`
  // array (which carries the live config captured during enumeration)
  // — re-reading from disk here would race with any concurrent
  // operator action, and the rebind loop also relies on that cached
  // config for the spread, so the snapshot is consistent with what
  // the loop would write.
  const snapshots = new Map<string, LaneConfig>();
  for (const { id: laneId, config } of dependents) {
    snapshots.set(laneId, config);
  }

  // Track which lanes have actually been rebound on disk so the
  // rollback path can selectively restore only those, leaving lanes
  // the loop never reached untouched.
  const reboundLaneIds: string[] = [];

  const reassigned: { laneId: string; from: string; to: string }[] = [];
  const path = pipelineOverridePath(projectRoot, opts.id);

  /**
   * Restore every lane in `reboundLaneIds` from `snapshots`. Used by
   * the rollback path on failure during the rebind loop OR during the
   * override unlink. Each restore is itself an atomic tmp+rename via
   * `commitLaneConfig`; a restore failure is swallowed (with the lane
   * id included in the aggregated message) so the caller sees the
   * original error AND a list of any lanes that couldn't be rolled
   * back, rather than the rollback's own error masking the root cause.
   */
  function rollbackReboundLanes(): string[] {
    const failedRestores: string[] = [];
    for (const laneId of reboundLaneIds) {
      const original = snapshots.get(laneId);
      if (original === undefined) {
        // Defensive: every rebound lane was snapshotted before the
        // loop; reaching here means the data structure invariant
        // was violated. Record and continue.
        failedRestores.push(`${laneId} (no snapshot found)`);
        continue;
      }
      try {
        commitLaneConfig(
          projectRoot,
          laneId,
          original,
          'pipeline-delete rollback',
        );
      } catch (restoreErr) {
        const detail = restoreErr instanceof Error
          ? restoreErr.message
          : String(restoreErr);
        failedRestores.push(`${laneId} (${detail})`);
      }
    }
    return failedRestores;
  }

  if (reassignTarget !== undefined) {
    try {
      for (const { id: laneId, config } of dependents) {
        const updated: LaneConfig = {
          ...config,
          pipelineTemplate: reassignTarget,
        };
        commitLaneConfig(projectRoot, laneId, updated, 'pipeline-delete reassign');
        reboundLaneIds.push(laneId);
        reassigned.push({
          laneId,
          from: opts.id,
          to: reassignTarget,
        });
      }
    } catch (rebindErr) {
      const failedRestores = rollbackReboundLanes();
      const original = rebindErr instanceof Error
        ? rebindErr.message
        : String(rebindErr);
      const suffix = failedRestores.length > 0
        ? ` Rollback could not restore: ${failedRestores.join('; ')}.`
        : '';
      throw new Error(
        `Cannot delete pipeline "${opts.id}": dependent-lane rebind `
        + `failed mid-batch (${reboundLaneIds.length}/`
        + `${dependents.length} lanes were rebound and have now been `
        + `rolled back to their original pipelineTemplate). Original `
        + `error: ${original}.${suffix}`,
      );
    }
  }

  // Unlink the override. We use existsSync as a final guard so a race
  // (the file disappearing between the early hasPipelineOverride check
  // and the unlink) surfaces as a clear "already deleted" error rather
  // than ENOENT bubble-through. AUDIT-20260530-63: if the existsSync
  // guard OR the unlinkSync throws, we restore every already-rebound
  // lane from snapshot so the operator-visible state matches the
  // pre-call state (override still present, lanes still pointing at
  // it).
  if (!existsSync(path)) {
    const failedRestores = rollbackReboundLanes();
    const suffix = failedRestores.length > 0
      ? ` Rollback could not restore: ${failedRestores.join('; ')}.`
      : '';
    throw new Error(
      `Cannot delete pipeline "${opts.id}": override at ${path} disappeared `
      + `between refusal-check and unlink (concurrent removal?).${suffix}`,
    );
  }
  try {
    unlinkSync(path);
  } catch (unlinkErr) {
    const failedRestores = rollbackReboundLanes();
    const original = unlinkErr instanceof Error
      ? unlinkErr.message
      : String(unlinkErr);
    const suffix = failedRestores.length > 0
      ? ` Rollback could not restore: ${failedRestores.join('; ')}.`
      : '';
    throw new Error(
      `Cannot delete pipeline "${opts.id}": unlink of override at ${path} `
      + `failed (${reboundLaneIds.length}/${dependents.length} lanes were `
      + `rebound and have now been rolled back to their original `
      + `pipelineTemplate). Original error: ${original}.${suffix}`,
    );
  }

  // Reviewer-fix #3: clean up the rename-migration sidecar if one
  // exists. Leaving it behind would let a subsequent
  // `pipeline create <same-id>` inherit a stale audit trail and
  // confuse the doctor-side reader. The sidecar is optional (the
  // pipeline may never have been --rename-stage'd), so guard on
  // existsSync.
  //
  // AUDIT-20260530-63: this runs after the override is already
  // unlinked. A failure here is best-effort — the override is gone,
  // the lanes are rebound, the operator-visible state is correct;
  // a leftover migration sidecar is a doctor-surfaceable cleanup
  // concern, not a rollback trigger.
  const migrationPath = pipelineMigrationPath(projectRoot, opts.id);
  if (existsSync(migrationPath)) {
    try {
      unlinkSync(migrationPath);
    } catch {
      // Migration-sidecar cleanup is best-effort. The pipeline is
      // already deleted and lanes are rebound; doctor will surface
      // the leftover sidecar on the next audit.
    }
  }

  // AUDIT-20260530-63: journal append is best-effort once the
  // override has been unlinked. The template is gone; the lanes are
  // rebound; the lifecycle state is correct. Re-creating the override
  // to undo the delete would leave the operator's lane state already
  // pointing at the replacement template — a worse partial state
  // than a missing journal event. We let the journal-append error
  // bubble so the operator sees it, but the delete itself is
  // considered to have succeeded.
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
