/**
 * Pipeline operations — barrel export.
 *
 * Phase 6 Task 6.2 (graphical-entries). The CLI `pipeline` verb is a
 * thin dispatcher over these core functions: each verb has a matching
 * named export here. All mutating operations are async (so the
 * journal-event append can be awaited); side-effects are the pipeline
 * JSON write, lane-config rewrites (on `delete --reassign-lanes-to`),
 * and the journal-event append.
 */

export {
  listPipelines,
  type ListedPipeline,
  type ListPipelinesResult,
  type MalformedPipeline,
  type PipelineSource,
} from './list.ts';
export { showPipeline, type ShowPipelineResult } from './show.ts';
export {
  createPipeline,
  type CreatePipelineOptions,
  type CreatePipelineResult,
} from './create.ts';
export {
  updatePipeline,
  type UpdatePipelineOperation,
  type UpdatePipelineOptions,
  type UpdatePipelineResult,
} from './update.ts';
export {
  deletePipeline,
  type DeletePipelineOptions,
  type DeletedPipelineResult,
} from './delete.ts';
