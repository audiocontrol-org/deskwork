/**
 * Lane operations — barrel export.
 *
 * Phase 6 Task 6.1 (graphical-entries). The CLI `lane` verb is a thin
 * dispatcher over these core functions: each verb has a matching
 * named export here. All operations are async (so the journal-event
 * append can be awaited); side-effects are the lane JSON write, the
 * sidecar / artifact relocation (on `move`), and the journal-event
 * append.
 */

export { createLane } from './create.ts';
export { showLane } from './show.ts';
export { listLanes } from './list.ts';
export { updateLane } from './update.ts';
export { archiveLane, restoreLane } from './archive.ts';
export { purgeLane } from './purge.ts';
export { moveEntryToLane } from './move.ts';

export type { CreateLaneOptions, CreateLaneResult } from './create.ts';
export type {
  ListLanesOptions,
  ListLanesResult,
  ListedLane,
  MalformedLane,
} from './list.ts';
export type { UpdateLaneOptions, UpdateLaneResult } from './update.ts';
export type { ArchiveLaneResult } from './archive.ts';
export type { PurgeLaneResult } from './purge.ts';
export type { MoveEntryOptions, MoveEntryResult } from './move.ts';
