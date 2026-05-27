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
} from './loader.ts';
