/**
 * pipeline list — enumerate every pipeline template visible to the
 * project, classifying each as `project-override` (operator-authored
 * JSON under `.deskwork/pipelines/`) or `plugin-preset` (shipped with
 * `@deskwork/core`).
 *
 * Phase 6 Task 6.2 (graphical-entries). The CLI handler defaults to
 * emitting just ids; passing `--full` causes the handler to load each
 * template and report its stage counts + override-vs-preset source.
 * This module hands the handler both the id-only and the detail-rich
 * shapes; the CLI handler picks the slice it needs based on the
 * `--full` boolean.
 *
 * AUDIT-20260530-57 (Task 0.33): per-id load failures are collected
 * into a `malformed: { id, error }[]` channel instead of propagating
 * the first failure as a throw. The enumeration source
 * (`listAvailablePipelineTemplates`) deliberately tolerates corrupt
 * project overrides — it just enumerates basenames matching the
 * pipeline id regex without validating any JSON. This operation
 * honors that contract by surfacing healthy templates (built-in
 * presets + healthy overrides) alongside a flagged-broken channel, so
 * a single corrupt override no longer aborts the enumeration and
 * hides every built-in preset from the operator's picker.
 */

import {
  hasPipelineOverride,
  listAvailablePipelineTemplates,
  loadPipelineTemplate,
} from '../loader.ts';
import type { PipelineTemplate } from '../types.ts';

export type PipelineSource = 'project-override' | 'plugin-preset';

export interface ListedPipeline {
  readonly id: string;
  readonly template: PipelineTemplate;
  readonly source: PipelineSource;
  readonly linearStageCount: number;
  readonly lockedStageCount: number;
  readonly offPipelineStageCount: number;
}

export interface MalformedPipeline {
  readonly id: string;
  readonly error: string;
}

export interface ListPipelinesResult {
  /** Templates whose JSON parsed + validated; ordered by id. */
  readonly pipelines: readonly ListedPipeline[];
  /**
   * Templates whose JSON failed to load (parse error, schema violation,
   * id mismatch). Each entry carries the id and the underlying error
   * message so CLI surfaces can render a flagged-broken section without
   * aborting the whole enumeration.
   */
  readonly malformed: readonly MalformedPipeline[];
}

export function listPipelines(projectRoot: string): ListPipelinesResult {
  const ids = listAvailablePipelineTemplates(projectRoot);
  const pipelines: ListedPipeline[] = [];
  const malformed: MalformedPipeline[] = [];
  for (const id of ids) {
    try {
      const template = loadPipelineTemplate(id, projectRoot);
      const source: PipelineSource = hasPipelineOverride(projectRoot, id)
        ? 'project-override'
        : 'plugin-preset';
      pipelines.push({
        id,
        template,
        source,
        linearStageCount: template.linearStages.length,
        lockedStageCount: template.lockedStages?.length ?? 0,
        offPipelineStageCount: template.offPipelineStages.length,
      });
    } catch (err) {
      malformed.push({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { pipelines, malformed };
}
