/**
 * Pure folds over an annotation stream — extracted from annotations.ts
 * so the controller stays under the project's 500-line cap.
 *
 * Both helpers consume the journal-shaped event list (every fact, in
 * chronological order) and reduce it to the latest-state-per-comment
 * the UI needs:
 *
 *   - `resolvedCommentIds` — comment ids whose latest `resolve` event
 *     said `resolved: true`. (A comment can be resolved + re-opened
 *     multiple times; only the last verb counts.)
 *   - `latestAddressByCommentId` — latest `address` annotation per
 *     comment id. The address annotation carries the iteration's
 *     disposition (`addressed | deferred | wontfix`) which the sidebar
 *     stamps on the comment item.
 *
 * Sort by `createdAt` ASC so map insertion-order ends up with the
 * newest event last.
 */

import type {
  AddressAnnotation,
  ResolveAnnotation,
} from './state.ts';

export function resolvedCommentIds(all: ResolveAnnotation[]): Set<string> {
  const byCreatedAt = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, boolean>();
  for (const r of byCreatedAt) map.set(r.commentId, r.resolved);
  const resolved = new Set<string>();
  for (const [commentId, isResolved] of map) {
    if (isResolved) resolved.add(commentId);
  }
  return resolved;
}

export function latestAddressByCommentId(
  all: AddressAnnotation[],
): Map<string, AddressAnnotation> {
  const byCreatedAt = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, AddressAnnotation>();
  for (const a of byCreatedAt) map.set(a.commentId, a);
  return map;
}
