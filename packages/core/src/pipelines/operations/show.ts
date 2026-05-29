/**
 * pipeline show — return the fully-resolved pipeline template plus the
 * source-classification flag (project-override vs plugin-preset).
 *
 * Phase 6 Task 6.2 (graphical-entries). Thin convenience around
 * `loadPipelineTemplate` + `hasPipelineOverride`. Mirrors `lane show`
 * — keeps the CLI handler thin by routing through the operations
 * surface rather than the loader directly, so future lifecycle
 * side-effects (audit-trail emission, etc.) can land without
 * re-plumbing the CLI.
 */

import {
  hasPipelineOverride,
  loadPipelineTemplate,
} from '../loader.ts';
import type { PipelineTemplate } from '../types.ts';
import type { PipelineSource } from './list.ts';

export interface ShowPipelineResult {
  readonly template: PipelineTemplate;
  readonly source: PipelineSource;
}

export function showPipeline(
  projectRoot: string,
  id: string,
): ShowPipelineResult {
  const template = loadPipelineTemplate(id, projectRoot);
  const source: PipelineSource = hasPipelineOverride(projectRoot, id)
    ? 'project-override'
    : 'plugin-preset';
  return { template, source };
}
