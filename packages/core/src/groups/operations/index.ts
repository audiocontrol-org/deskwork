/**
 * Group operations — barrel export.
 *
 * Phase 7 Task 7.2 (graphical-entries). The CLI `group` verb is a
 * thin dispatcher over these core functions: each verb has a
 * matching named export here. All operations are async (journal
 * append + sidecar write are async); side-effects are the entry
 * sidecar write and the journal-event append.
 */

export { createGroup } from './create.ts';
export { updateGroup } from './update.ts';
export { showGroup } from './show.ts';
export { listGroups } from './list.ts';
export { addGroupMember } from './add-member.ts';
export { removeGroupMember } from './remove-member.ts';
export { archiveGroup, restoreGroup } from './archive.ts';

export type { CreateGroupOptions, CreateGroupResult } from './create.ts';
export type { UpdateGroupOptions, UpdateGroupResult } from './update.ts';
export type { ShowGroupResult, MemberSummary } from './show.ts';
export type { ListGroupsOptions, ListedGroup } from './list.ts';
export type {
  AddGroupMemberOptions,
  AddGroupMemberResult,
} from './add-member.ts';
export type {
  RemoveGroupMemberOptions,
  RemoveGroupMemberResult,
} from './remove-member.ts';
export type { ArchiveGroupResult } from './archive.ts';
