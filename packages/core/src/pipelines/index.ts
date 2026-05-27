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
  type StrictPipelineTemplate,
} from './types.ts';

export {
  loadPipelineTemplate,
  listAvailablePipelineTemplates,
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
