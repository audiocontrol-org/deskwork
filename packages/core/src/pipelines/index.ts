/**
 * Pipeline templates — barrel export.
 *
 * `PipelineTemplate` + `PipelineTemplateSchema` define the per-template
 * contract; `loadPipelineTemplate` + `listAvailablePipelineTemplates`
 * resolve preset and override JSON files at runtime.
 */

export {
  PipelineTemplateSchema,
  type PipelineTemplate,
} from './types.ts';

export {
  loadPipelineTemplate,
  listAvailablePipelineTemplates,
  pipelineOverridesDir,
  pipelineOverridePath,
  pipelinePluginDefaultPath,
  pipelineMigrationsDir,
  pipelineMigrationPath,
  assertSafePipelineId,
  isPluginPresetPipeline,
  hasPipelineOverride,
  PIPELINE_ID_REGEX,
} from './loader.ts';

export {
  isLinearPipelineStageInTemplate,
  isOffPipelineStageInTemplate,
  isLockedStageInTemplate,
  isKnownStageInTemplate,
  nextStageInTemplate,
  assertStageInTemplate,
  terminalLinearStage,
  preTerminalLinearStage,
} from './helpers.ts';

export { stageNameToFilesystemToken } from './stage-token.ts';

// Phase 6 Task 6.2 — pipeline-template CRUD operations consumed by
// the CLI `pipeline` verb. Each named export is the per-verb core
// function.
export {
  listPipelines,
  showPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  type ListedPipeline,
  type PipelineSource,
  type ShowPipelineResult,
  type CreatePipelineOptions,
  type CreatePipelineResult,
  type UpdatePipelineOperation,
  type UpdatePipelineOptions,
  type UpdatePipelineResult,
  type DeletePipelineOptions,
  type DeletedPipelineResult,
} from './operations/index.ts';
