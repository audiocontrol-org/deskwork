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
 * Stage counts are derived from the loaded template. A malformed
 * project override surfaces as a load-time error here (just like
 * `lane list` surfaces malformed lane configs) rather than as a silent
 * "missing" entry in the picker.
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

export function listPipelines(projectRoot: string): ListedPipeline[] {
  const ids = listAvailablePipelineTemplates(projectRoot);
  return ids.map((id) => {
    const template = loadPipelineTemplate(id, projectRoot);
    const source: PipelineSource = hasPipelineOverride(projectRoot, id)
      ? 'project-override'
      : 'plugin-preset';
    return {
      id,
      template,
      source,
      linearStageCount: template.linearStages.length,
      lockedStageCount: template.lockedStages?.length ?? 0,
      offPipelineStageCount: template.offPipelineStages.length,
    };
  });
}
