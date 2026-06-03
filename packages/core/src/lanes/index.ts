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
  LANE_ID_REGEX,
  type LaneConfig,
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

// Phase 39c-2b (sub-task b) — add-time artifactPath composition. The
// directory comes from the lane's `scaffoldDefaults[kind]`; the on-disk
// shape comes from the layout; the slug fills the rest. Fails loudly
// when the lane declares no default for the requested kind.
export {
  composeAddArtifactPath,
  composeRelativePath,
  layoutToContentRelativePath,
  parseScaffoldLayout,
  defaultLayoutForKind,
  legalLayoutsForKind,
  isLayoutLegalForKind,
  DEFAULT_SCAFFOLD_LAYOUT,
  SCAFFOLD_LAYOUTS,
  type ScaffoldLayout,
} from './scaffold-path.ts';

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
