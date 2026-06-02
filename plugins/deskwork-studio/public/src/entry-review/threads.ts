/**
 * Comment-thread grouping helper for the entry-keyed press-check
 * client (Phase 8 Task 8.2 — Step 8.2.1 + Step 8.2.2).
 *
 * Single-level threading per the Step 8.1.1 schema contract: every
 * comment is either a root (no `replyTo`) or a reply pointing at a
 * root (`replyTo` resolves to a root comment id). The grouping
 * helper builds a `Thread` per root and flattens replies under it.
 *
 * Phase 8 Task 8.2 placement decision — sidebar-grouped (NOT
 * inline-on-pin). The marginalia sidebar already organizes comments
 * as a single-column list; threading reuses that column and stacks
 * reply cards under the root card. Inline-on-pin (rendering thread
 * chrome next to the document highlight) would require new
 * on-document pin DOM, scroll-positioning logic, and would conflict
 * with the existing per-comment highlight markup. Sidebar-grouped is
 * the simpler translation and matches the existing affordance shape.
 * Operator may override this pick in Phase 9 by extending the
 * sidebar-render module's thread-rendering branch.
 *
 * Edge cases:
 * - Orphan reply: a comment with `replyTo` set to an id that does
 *   not resolve to a known comment in this batch. We promote it to a
 *   root in its own thread with `isOrphan === true` so the renderer
 *   can mark it (data-orphan-reply="true" + a tooltip-class label)
 *   instead of dropping the comment silently.
 * - Reply to a reply: when the resolved target is itself a reply,
 *   we walk up to the eventual root and attach the reply there.
 *   Single-level threading is the contract; nested replies render
 *   flattened under the original root. A future phase can extend
 *   to nested branches by adding a `parentReplyId` field on
 *   `ThreadReply` and a recursive renderer.
 * - Empty input → empty output (no crash).
 * - Replies are sorted by `createdAt` ascending; orphan-root and
 *   real-root threads are returned in the same order as their root
 *   appears in the input array (input order is preserved for roots).
 */

import type { CommentAnnotation } from './state.ts';

export interface Thread {
  readonly root: CommentAnnotation;
  readonly replies: readonly CommentAnnotation[];
  /**
   * True when this thread's "root" is actually a reply comment whose
   * `replyTo` did not resolve to a known root. The renderer surfaces
   * this via `data-orphan-reply="true"` on the card so the operator
   * sees the broken-thread state explicitly rather than a silently-
   * promoted reply.
   */
  readonly isOrphan: boolean;
}

/**
 * Group a flat list of `CommentAnnotation` into threads.
 *
 * Algorithm:
 *   1. First pass: index every comment by id; identify roots
 *      (no `replyTo`) vs replies (has `replyTo`).
 *   2. Second pass: for each reply, walk `replyTo` chains until we
 *      land on a root or an unresolvable id. Land at a root → attach
 *      as a reply to that root's thread. Unresolvable → spin up an
 *      orphan thread for the reply itself.
 *   3. Sort replies within each thread by `createdAt` ascending. The
 *      root keeps its original position in the input ordering of
 *      roots; orphan threads appear in the input ordering of their
 *      original reply comments, interleaved after all real-root
 *      threads (so a broken thread doesn't shuffle the operator's
 *      reading order of the legitimate threads).
 */
export function groupCommentsIntoThreads(
  comments: readonly CommentAnnotation[],
): Thread[] {
  if (comments.length === 0) return [];

  const byId = new Map<string, CommentAnnotation>();
  for (const c of comments) byId.set(c.id, c);

  // Roots in input order — threads array index parity with the
  // first time we see each root.
  const rootIndexById = new Map<string, number>();
  const rootOrder: CommentAnnotation[] = [];
  const replyBucketsByRootId = new Map<string, CommentAnnotation[]>();

  for (const c of comments) {
    if (c.replyTo === undefined) {
      if (!rootIndexById.has(c.id)) {
        rootIndexById.set(c.id, rootOrder.length);
        rootOrder.push(c);
        replyBucketsByRootId.set(c.id, []);
      }
    }
  }

  const orphanThreads: Thread[] = [];

  for (const c of comments) {
    if (c.replyTo === undefined) continue;
    const rootId = resolveRootId(c, byId);
    if (rootId === null) {
      // Orphan — the reply chain doesn't terminate in a known root.
      orphanThreads.push({ root: c, replies: [], isOrphan: true });
      continue;
    }
    // The chain might lead us to a comment that isn't in our root
    // index (e.g. the resolved root wasn't included in the input
    // batch). Treat that as orphan too.
    if (!rootIndexById.has(rootId)) {
      orphanThreads.push({ root: c, replies: [], isOrphan: true });
      continue;
    }
    const bucket = replyBucketsByRootId.get(rootId);
    if (bucket === undefined) continue;
    bucket.push(c);
  }

  // Sort each bucket by createdAt ascending. Stable order within
  // identical timestamps preserves input order, which matches the
  // operator's typing sequence.
  for (const bucket of replyBucketsByRootId.values()) {
    bucket.sort((a, b) => compareCreatedAt(a, b));
  }

  const threads: Thread[] = rootOrder.map((root) => ({
    root,
    replies: replyBucketsByRootId.get(root.id) ?? [],
    isOrphan: false,
  }));

  return [...threads, ...orphanThreads];
}

/**
 * Walk `replyTo` chains from `start` until we land at a comment with
 * no `replyTo` (the root) or an unresolvable id (return null).
 *
 * Cycle protection: we cap the walk at the number of comments we
 * indexed, since each step must visit a distinct comment or it
 * would have terminated. A cycle (which the schema theoretically
 * permits at the JSON level even though the contract forbids it)
 * returns null and the renderer marks the comment as orphan.
 */
function resolveRootId(
  start: CommentAnnotation,
  byId: ReadonlyMap<string, CommentAnnotation>,
): string | null {
  const maxSteps = byId.size + 1;
  const seen = new Set<string>();
  let cursor: CommentAnnotation | undefined = start;
  for (let i = 0; i < maxSteps; i++) {
    if (cursor === undefined) return null;
    if (cursor.replyTo === undefined) return cursor.id;
    if (seen.has(cursor.id)) return null;
    seen.add(cursor.id);
    cursor = byId.get(cursor.replyTo);
  }
  return null;
}

function compareCreatedAt(
  a: CommentAnnotation,
  b: CommentAnnotation,
): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return 0;
}

/**
 * Per-thread predicate: does this thread carry one or more replies?
 * Roots that are not replied-to render as plain cards (no badge, no
 * expand affordance); roots with replies render with the reply-count
 * badge and the click-to-expand chrome.
 */
export function threadHasReplies(thread: Thread): boolean {
  return thread.replies.length > 0;
}

/**
 * Build the user-facing badge label for a thread's reply count.
 * Examples:
 *   1 reply  →  "1 reply"
 *   2 reply  →  "2 replies"
 *   0 reply  →  "" (caller should gate on threadHasReplies first)
 */
export function replyCountLabel(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return '1 reply';
  return `${count} replies`;
}
