/**
 * Groups — barrel export.
 *
 * Phase 7 Task 7.2 (graphical-entries). Per Task 7.1.2, a "group" is
 * an entry whose `members[]` is non-empty — there is no separate
 * Group type or schema. The group operations module + predicates
 * here are the canonical entry point for code that needs to
 * distinguish group entries from regular entries (the studio
 * dashboard, doctor's group-* rules, the per-verb CLI handlers).
 */

export { isArchivedEntry, isGroupEntry } from './types.ts';

// Phase 7 Task 7.2 — group CRUD operations consumed by the CLI
// `group` verb. Each named export is the per-verb core function.
export {
  createGroup,
  updateGroup,
  showGroup,
  listGroups,
  addGroupMember,
  removeGroupMember,
  archiveGroup,
  restoreGroup,
  type CreateGroupOptions,
  type CreateGroupResult,
  type UpdateGroupOptions,
  type UpdateGroupResult,
  type ShowGroupResult,
  type MemberSummary,
  type ListGroupsOptions,
  type ListedGroup,
  type AddGroupMemberOptions,
  type AddGroupMemberResult,
  type RemoveGroupMemberOptions,
  type RemoveGroupMemberResult,
  type ArchiveGroupResult,
} from './operations/index.ts';
