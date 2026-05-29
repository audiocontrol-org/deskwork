/**
 * pipeline update — mutate a project-override pipeline template.
 *
 * Phase 6 Task 6.2 (graphical-entries). Five mutually-exclusive
 * operations the CLI surfaces as flags. Exactly one operation runs per
 * `update` invocation; the CLI handler is responsible for refusing
 * multiply-flagged invocations.
 *
 *   - `add-stage`        — insert `<stage>` into linearStages at
 *                          `<position>` (default = end).
 *   - `rename-stage`     — rename `<from>` to `<to>` wherever it
 *                          appears (linearStages / lockedStages /
 *                          offPipelineStages). Appends a sidecar
 *                          migration entry to
 *                          `migrations/<id>.json` consumed by the
 *                          doctor verb (Phase 6 Task 6.5) for
 *                          affected-entry remediation.
 *   - `remove-stage`     — remove `<stage>` from whichever list
 *                          contains it. Refused when any entry's
 *                          `currentStage` references it.
 *   - `set-locked`       — replace `lockedStages` wholesale.
 *                          Cross-validates the new set is a subset of
 *                          `linearStages`.
 *   - `set-off-pipeline` — replace `offPipelineStages` wholesale.
 *                          Cross-validates disjointness from
 *                          `linearStages`.
 *
 * Refusal modes (shared):
 *   - The id resolves to a plugin preset (read-only). The operator
 *     should run `customize pipeline <preset-id>` to create an
 *     override first.
 *   - No project override exists for `<id>` — `update` requires the
 *     override to be on disk.
 *
 * Emits a `pipeline-update` journal event on success carrying the
 * operation discriminator + before/after fields where appropriate.
 *
 * Layout note (Phase 6 Task 6.2 review fix #1): the rename-migration
 * sidecar lives at `<projectRoot>/.deskwork/pipelines/migrations/<id>.json`,
 * a SIBLING directory of the per-template overrides. Co-locating it
 * with the templates (the original Task 6.2 shape, `<id>-renames.json`
 * in the override dir) caused `pipeline list`'s JSON enumerator to try
 * loading the migration file as a pipeline template; Zod parse failed
 * and the list verb broke after any rename. The migrations subdirectory
 * is invisible to the override enumerator because it's a directory, not
 * a `*.json` file.
 *
 * Concurrency note: this module assumes a single operator at-rest;
 * concurrent `--rename-stage` operations against the same id race on
 * the migrations sidecar and the second writer wins. The PRD documents
 * deskwork as operator-driven; no file-locking is added without
 * explicit operator approval. (Reviewer finding #5, decline-with-
 * reasoning.)
 *
 * Atomicity note: the journal-event append at the bottom of
 * `updatePipeline` is not atomic with the commit + migration write —
 * matches the precedent in lanes operations (Phase 6 Task 6.1) where
 * the same pattern was accepted. (Reviewer finding #11, decline-with-
 * reasoning.)
 */

import { appendJournalEvent } from '../../journal/append.ts';
import { readAllSidecars } from '../../sidecar/read-all.ts';
import {
  hasPipelineOverride,
  isPluginPresetPipeline,
  loadPipelineTemplate,
  assertSafePipelineId,
} from '../loader.ts';
import { type PipelineTemplate } from '../types.ts';
import { commitPipelineTemplate } from './commit.ts';
import { appendRenameMigration } from './rename-migration.ts';

export type UpdatePipelineOperation =
  | { readonly op: 'add-stage'; readonly stage: string; readonly position?: number }
  | { readonly op: 'rename-stage'; readonly from: string; readonly to: string }
  | { readonly op: 'remove-stage'; readonly stage: string }
  | { readonly op: 'set-locked'; readonly stages: readonly string[] }
  | { readonly op: 'set-off-pipeline'; readonly stages: readonly string[] };

export interface UpdatePipelineOptions {
  readonly id: string;
  readonly operation: UpdatePipelineOperation;
}

export interface UpdatePipelineResult {
  readonly template: PipelineTemplate;
  readonly path: string;
}

export async function updatePipeline(
  projectRoot: string,
  opts: UpdatePipelineOptions,
): Promise<UpdatePipelineResult> {
  // Reviewer-fix #10: validate the id BEFORE the preset / override
  // checks so a traversed id surfaces as "Invalid pipeline id" rather
  // than leaking the traversed path through the override-missing
  // diagnostic. Idempotent against the subsequent loader-internal
  // call from loadPipelineTemplate.
  assertSafePipelineId(projectRoot, opts.id);

  // Pre-flight: refuse on read-only presets so the operator gets a
  // pointer to `customize pipeline <id>` rather than a confusing
  // "no override exists" error. The plugin-preset check fires before
  // the override-presence check because a project that hasn't yet
  // customized a preset will fail both — naming the preset surface is
  // the more actionable diagnostic.
  if (
    isPluginPresetPipeline(opts.id)
    && !hasPipelineOverride(projectRoot, opts.id)
  ) {
    throw new Error(
      `Cannot update pipeline "${opts.id}": "${opts.id}" is a built-in `
      + `plugin preset and is read-only. Run `
      + `"deskwork customize pipeline ${opts.id}" to create a project `
      + `override first.`,
    );
  }

  if (!hasPipelineOverride(projectRoot, opts.id)) {
    throw new Error(
      `Cannot update pipeline "${opts.id}": no project override exists. `
      + `Create one with "deskwork pipeline create ${opts.id} --shape ..." `
      + `or "deskwork customize pipeline ${opts.id}" (to clone a preset).`,
    );
  }

  const existing = loadPipelineTemplate(opts.id, projectRoot);
  const candidate = applyOperation(existing, opts.operation, opts.id);

  // Operations that read entry state for refusal-checks run after we
  // have the candidate (so the error includes what's about to change)
  // but before the commit. `remove-stage` is the only such case today.
  if (opts.operation.op === 'remove-stage') {
    await refuseRemoveStageWhenReferenced(
      projectRoot,
      opts.id,
      opts.operation.stage,
    );
  }

  const { template, path } = commitPipelineTemplate(
    projectRoot,
    opts.id,
    candidate,
    'update',
  );

  // The rename-stage migration sidecar fires AFTER the commit succeeds
  // so a doomed write doesn't leave a stranded migration entry.
  if (opts.operation.op === 'rename-stage') {
    appendRenameMigration(
      projectRoot,
      opts.id,
      opts.operation.from,
      opts.operation.to,
    );
  }

  await appendJournalEvent(projectRoot, {
    kind: 'pipeline-update',
    at: new Date().toISOString(),
    pipelineId: opts.id,
    details: buildEventDetails(opts.operation, existing),
  });

  return { template, path };
}

/**
 * Apply a single operation to the template, returning a fresh
 * candidate template. Pure function — no I/O.
 */
function applyOperation(
  existing: PipelineTemplate,
  op: UpdatePipelineOperation,
  id: string,
): PipelineTemplate {
  switch (op.op) {
    case 'add-stage':
      return applyAddStage(existing, op.stage, op.position, id);
    case 'rename-stage':
      return applyRenameStage(existing, op.from, op.to, id);
    case 'remove-stage':
      return applyRemoveStage(existing, op.stage, id);
    case 'set-locked':
      return applySetLocked(existing, op.stages, id);
    case 'set-off-pipeline':
      return applySetOffPipeline(existing, op.stages, id);
  }
}

function applyAddStage(
  existing: PipelineTemplate,
  stage: string,
  position: number | undefined,
  id: string,
): PipelineTemplate {
  if (stage.trim().length === 0) {
    throw new Error(
      `Cannot update pipeline "${id}": --add-stage value is blank.`,
    );
  }
  const allKnown = collectKnownStages(existing);
  if (allKnown.has(stage)) {
    throw new Error(
      `Cannot update pipeline "${id}": stage "${stage}" already exists `
      + `in this template.`,
    );
  }
  const linearStages = [...existing.linearStages];
  const insertAt = position ?? linearStages.length;
  if (insertAt < 0 || insertAt > linearStages.length) {
    throw new Error(
      `Cannot update pipeline "${id}": --position ${insertAt} is out of `
      + `range. linearStages currently has ${linearStages.length} entries; `
      + `pass a value in [0, ${linearStages.length}].`,
    );
  }
  linearStages.splice(insertAt, 0, stage);
  return { ...existing, linearStages };
}

function applyRenameStage(
  existing: PipelineTemplate,
  from: string,
  to: string,
  id: string,
): PipelineTemplate {
  if (from.trim().length === 0 || to.trim().length === 0) {
    throw new Error(
      `Cannot update pipeline "${id}": --rename-stage requires both `
      + `<from> and <to> non-empty.`,
    );
  }
  if (from === to) {
    throw new Error(
      `Cannot update pipeline "${id}": --rename-stage <from> and <to> `
      + `are identical (${from}).`,
    );
  }
  const allKnown = collectKnownStages(existing);
  if (!allKnown.has(from)) {
    throw new Error(
      `Cannot update pipeline "${id}": stage "${from}" not found. `
      + `Known stages: ${[...allKnown].join(', ')}.`,
    );
  }
  if (allKnown.has(to)) {
    throw new Error(
      `Cannot update pipeline "${id}": cannot rename to "${to}" — that `
      + `name already exists in this template.`,
    );
  }
  return {
    ...existing,
    linearStages: existing.linearStages.map((s) => (s === from ? to : s)),
    ...(existing.lockedStages !== undefined && {
      lockedStages: existing.lockedStages.map((s) => (s === from ? to : s)),
    }),
    offPipelineStages: existing.offPipelineStages.map((s) =>
      s === from ? to : s,
    ),
  };
}

function applyRemoveStage(
  existing: PipelineTemplate,
  stage: string,
  id: string,
): PipelineTemplate {
  if (stage.trim().length === 0) {
    throw new Error(
      `Cannot update pipeline "${id}": --remove-stage value is blank.`,
    );
  }
  const allKnown = collectKnownStages(existing);
  if (!allKnown.has(stage)) {
    throw new Error(
      `Cannot update pipeline "${id}": stage "${stage}" not found. `
      + `Known stages: ${[...allKnown].join(', ')}.`,
    );
  }
  const linearStages = existing.linearStages.filter((s) => s !== stage);
  if (linearStages.length === 0 && existing.linearStages.length > 0) {
    throw new Error(
      `Cannot update pipeline "${id}": removing "${stage}" would leave `
      + `linearStages empty. A pipeline must have at least one linear stage.`,
    );
  }
  return {
    ...existing,
    linearStages,
    ...(existing.lockedStages !== undefined && {
      lockedStages: existing.lockedStages.filter((s) => s !== stage),
    }),
    offPipelineStages: existing.offPipelineStages.filter((s) => s !== stage),
  };
}

function applySetLocked(
  existing: PipelineTemplate,
  stages: readonly string[],
  id: string,
): PipelineTemplate {
  const linearSet = new Set(existing.linearStages);
  for (const stage of stages) {
    if (stage.trim().length === 0) {
      throw new Error(
        `Cannot update pipeline "${id}": --set-locked contains a blank entry.`,
      );
    }
    if (!linearSet.has(stage)) {
      throw new Error(
        `Cannot update pipeline "${id}": locked stage "${stage}" is not in `
        + `linearStages (${existing.linearStages.join(', ')}). lockedStages `
        + `must be a subset of linearStages.`,
      );
    }
  }
  return { ...existing, lockedStages: [...stages] };
}

function applySetOffPipeline(
  existing: PipelineTemplate,
  stages: readonly string[],
  id: string,
): PipelineTemplate {
  const linearSet = new Set(existing.linearStages);
  for (const stage of stages) {
    if (stage.trim().length === 0) {
      throw new Error(
        `Cannot update pipeline "${id}": --set-off-pipeline contains a `
        + `blank entry.`,
      );
    }
    if (linearSet.has(stage)) {
      throw new Error(
        `Cannot update pipeline "${id}": "${stage}" is already in `
        + `linearStages — a stage is either linear OR off-pipeline, not both.`,
      );
    }
  }
  return { ...existing, offPipelineStages: [...stages] };
}

/**
 * Collect every stage name visible on the template across all three
 * lists. Used for "does this name already exist" refusal checks.
 */
function collectKnownStages(template: PipelineTemplate): Set<string> {
  const set = new Set<string>(template.linearStages);
  if (template.lockedStages !== undefined) {
    for (const s of template.lockedStages) set.add(s);
  }
  for (const s of template.offPipelineStages) set.add(s);
  return set;
}

/**
 * Refuse `remove-stage` when any entry's `currentStage` still
 * references the doomed stage AND that entry is bound to a lane whose
 * pipelineTemplate is the one being mutated. Walking only the
 * matching-template entries keeps the error message focused — entries
 * in other lanes are unaffected by the mutation.
 */
async function refuseRemoveStageWhenReferenced(
  projectRoot: string,
  pipelineId: string,
  stage: string,
): Promise<void> {
  const sidecars = await readAllSidecars(projectRoot);
  if (sidecars.length === 0) return;

  // Lazy-load lane configs so we resolve each entry's template once.
  // Importing here (rather than at the top of the module) avoids a
  // load-order cycle with `lanes/operations/move.ts` which also reads
  // sidecars + pipelines.
  const { loadLaneConfig } = await import('../../lanes/loader.ts');

  const offenders: string[] = [];
  for (const entry of sidecars) {
    if (entry.lane === undefined) continue;
    let laneConfig;
    try {
      laneConfig = loadLaneConfig(entry.lane, projectRoot);
    } catch {
      // Malformed / missing lane config: skip — doctor surfaces that
      // separately. We don't want to mask the remove-stage diagnostic
      // behind an unrelated lane-config error.
      continue;
    }
    if (laneConfig.pipelineTemplate !== pipelineId) continue;
    if (entry.currentStage === stage) offenders.push(entry.slug);
  }

  if (offenders.length === 0) return;

  const sample = offenders.slice(0, 5);
  const remainder = offenders.length - sample.length;
  const suffix = remainder > 0 ? `, +${remainder} more` : '';
  throw new Error(
    `Cannot update pipeline "${pipelineId}": ${offenders.length} `
    + `${offenders.length === 1 ? 'entry references' : 'entries reference'} `
    + `stage "${stage}" via currentStage (${sample.join(', ')}${suffix}). `
    + `Induct each entry to another stage before removing.`,
  );
}

/**
 * Build the journal event's `details` object for a given operation.
 * Each branch shapes the discriminated-union member that matches the
 * operation kind.
 */
function buildEventDetails(
  op: UpdatePipelineOperation,
  existing: PipelineTemplate,
): {
  operation: 'add-stage';
  stage: string;
  position: number;
} | {
  operation: 'rename-stage';
  from: string;
  to: string;
} | {
  operation: 'remove-stage';
  stage: string;
} | {
  operation: 'set-locked';
  before: string[];
  after: string[];
} | {
  operation: 'set-off-pipeline';
  before: string[];
  after: string[];
} {
  switch (op.op) {
    case 'add-stage':
      return {
        operation: 'add-stage',
        stage: op.stage,
        position: op.position ?? existing.linearStages.length,
      };
    case 'rename-stage':
      return { operation: 'rename-stage', from: op.from, to: op.to };
    case 'remove-stage':
      return { operation: 'remove-stage', stage: op.stage };
    case 'set-locked':
      return {
        operation: 'set-locked',
        before: [...(existing.lockedStages ?? [])],
        after: [...op.stages],
      };
    case 'set-off-pipeline':
      return {
        operation: 'set-off-pipeline',
        before: [...existing.offPipelineStages],
        after: [...op.stages],
      };
  }
}
