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

export { stageNameToFilesystemToken } from './stage-token.ts';
