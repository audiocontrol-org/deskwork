/**
 * Lanes — barrel export.
 *
 * `LaneConfig` + `LaneConfigSchema` define the per-lane contract;
 * `loadLaneConfig` + `listLaneConfigs` resolve operator-authored lane
 * configs at runtime; `detectArtifactKind` classifies an on-disk
 * artifact path; `bootstrapDefaultLaneIfMissing` migrates legacy
 * single-site projects into the new lane-aware model.
 */

export {
  LaneConfigSchema,
  ArtifactKindSchema,
  type LaneConfig,
  type StrictLaneConfig,
  type ArtifactKind,
} from './types.ts';

export {
  loadLaneConfig,
  listLaneConfigs,
  lanesDir,
  laneConfigPath,
  type ListLaneConfigsOptions,
} from './loader.ts';

export { detectArtifactKind } from './detection.ts';

export {
  bootstrapDefaultLaneIfMissing,
  type BootstrapResult,
} from './bootstrap.ts';

export {
  resolveEntryTemplate,
  resolveEntryStrictTemplate,
} from './resolve.ts';

// stageNameToFilesystemToken relocated to ../pipelines/ since it operates
// on pipeline-template stage names; re-exported here for back-compat so
// existing `@/lanes/stage-token` callers keep resolving.
export { stageNameToFilesystemToken } from '../pipelines/stage-token.ts';

// Phase 6 Task 6.1 — lane CRUD operations consumed by the CLI
// `lane` verb. Each named export is the per-verb core function.
export {
  createLane,
  showLane,
  listLanes,
  updateLane,
  archiveLane,
  restoreLane,
  purgeLane,
  moveEntryToLane,
  type CreateLaneOptions,
  type CreateLaneResult,
  type ListLanesOptions,
  type ListedLane,
  type UpdateLaneOptions,
  type UpdateLaneResult,
  type ArchiveLaneResult,
  type PurgeLaneResult,
  type MoveEntryOptions,
  type MoveEntryResult,
} from './operations/index.ts';
