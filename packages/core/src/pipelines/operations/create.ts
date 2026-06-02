/**
 * pipeline create — write a new pipeline-template override JSON to
 * `.deskwork/pipelines/<id>.json`.
 *
 * Phase 6 Task 6.2 (graphical-entries). Two-arg shape:
 *
 *   - `id`     — kebab-case identifier; becomes the JSON filename
 *                basename and the JSON's `id` field.
 *   - `shape`  — array of linear-stage names that defines the
 *                pipeline. `lockedStages` defaults to empty;
 *                `offPipelineStages` defaults to empty. The `update`
 *                verb adjusts those after creation.
 *
 * Refusal modes:
 *   - The id collides with a plugin preset (`editorial`, `blog-post`,
 *     `feature-doc`, `qa-plan`, `visual` — read-only). The operator
 *     should pick a different id or use
 *     `customize pipeline <preset-id>` to create an override that
 *     mutates the preset.
 *   - A project override JSON already exists at the target path. The
 *     operator should use `pipeline update` to mutate it, or move the
 *     existing file aside.
 *   - The provided shape fails the underlying
 *     `PipelineTemplateSchema` validation (empty linearStages,
 *     duplicate stages, `Cancelled` in linearStages, stage-token
 *     collisions, etc.).
 *
 * Emits a `pipeline-create` journal event on success.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { appendJournalEvent } from '../../journal/append.ts';
import {
  assertSafePipelineId,
  hasPipelineOverride,
  isPluginPresetPipeline,
  pipelineOverridePath,
} from '../loader.ts';
import { type PipelineTemplate } from '../types.ts';
import { commitPipelineTemplate } from './commit.ts';

export interface CreatePipelineOptions {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly linearStages: readonly string[];
  readonly lockedStages?: readonly string[];
  readonly offPipelineStages?: readonly string[];
}

export interface CreatePipelineResult {
  readonly template: PipelineTemplate;
  readonly path: string;
}

export async function createPipeline(
  projectRoot: string,
  opts: CreatePipelineOptions,
): Promise<CreatePipelineResult> {
  assertSafePipelineId(projectRoot, opts.id);

  if (isPluginPresetPipeline(opts.id)) {
    throw new Error(
      `Cannot create pipeline "${opts.id}": "${opts.id}" is a built-in plugin `
      + `preset and is read-only. Pick a different id, or run `
      + `"deskwork customize pipeline ${opts.id}" to create a project override `
      + `that mutates the preset.`,
    );
  }

  if (hasPipelineOverride(projectRoot, opts.id)) {
    throw new Error(
      `Cannot create pipeline "${opts.id}": project override already exists `
      + `at ${pipelineOverridePath(projectRoot, opts.id)}. Use `
      + `"deskwork pipeline update ${opts.id}" to mutate it, or move the `
      + `existing file aside.`,
    );
  }

  if (opts.linearStages.length === 0) {
    throw new Error(
      `Cannot create pipeline "${opts.id}": linearStages is empty. `
      + `Pass at least one stage via --shape "<stage1>,<stage2>,...".`,
    );
  }
  for (const stage of opts.linearStages) {
    if (stage.trim().length === 0) {
      throw new Error(
        `Cannot create pipeline "${opts.id}": linearStages contains a blank `
        + `entry. Use comma-separated non-empty stage names.`,
      );
    }
  }

  const linearStages = [...opts.linearStages];
  const lockedStages = opts.lockedStages !== undefined
    ? [...opts.lockedStages]
    : [];
  const offPipelineStages = opts.offPipelineStages !== undefined
    ? [...opts.offPipelineStages]
    : [];

  const candidate: PipelineTemplate = {
    id: opts.id,
    name: opts.name ?? opts.id,
    description: opts.description ?? `Custom pipeline ${opts.id}`,
    linearStages,
    lockedStages,
    offPipelineStages,
  };

  const target = pipelineOverridePath(projectRoot, opts.id);
  mkdirSync(dirname(target), { recursive: true });
  const { template, path } = commitPipelineTemplate(
    projectRoot,
    opts.id,
    candidate,
    'create',
  );

  await appendJournalEvent(projectRoot, {
    kind: 'pipeline-create',
    at: new Date().toISOString(),
    pipelineId: opts.id,
    details: {
      name: template.name,
      linearStages: [...template.linearStages],
      lockedStages: [...(template.lockedStages ?? [])],
      offPipelineStages: [...template.offPipelineStages],
    },
  });

  return { template, path };
}
