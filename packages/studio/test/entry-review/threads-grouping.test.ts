/**
 * Phase 8 Task 8.2 Step 8.2.1 — `groupCommentsIntoThreads` unit tests.
 *
 * The grouping helper is the pure-data layer beneath the thread
 * renderer. Every edge case named in the task brief lives here so
 * that downstream renderer / permalink tests can rely on a
 * known-correct grouping result without re-deriving it.
 *
 * Cases covered:
 *   - Empty input → empty output.
 *   - Single root, no replies → 1 thread, 0 replies.
 *   - Root with N replies → 1 thread, N replies, sorted by createdAt
 *     ascending.
 *   - Orphan reply (replyTo doesn't resolve) → orphan thread with
 *     `isOrphan: true`, root is the orphan reply itself, no replies.
 *   - Reply to a reply → flattened under the original root (per
 *     Task 8.2's single-level threading contract).
 *   - Multiple roots → preserved in input order.
 *   - Reply-cycle (replyTo cycle) → treated as orphan.
 */

import { describe, it, expect } from 'vitest';
import {
  groupCommentsIntoThreads,
  threadHasReplies,
  replyCountLabel,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/threads.ts';
import type { CommentAnnotation } from '../../../../plugins/deskwork-studio/public/src/entry-review/state.ts';

function comment(over: Partial<CommentAnnotation> = {}): CommentAnnotation {
  return {
    id: over.id ?? 'c1',
    type: 'comment',
    workflowId: 'entry-uuid',
    version: 1,
    range: { start: 0, end: 10 },
    text: over.text ?? 'a comment',
    createdAt: over.createdAt ?? '2026-05-31T00:00:00.000Z',
    ...over,
  };
}

describe('groupCommentsIntoThreads (Phase 8 Step 8.2.1)', () => {
  it('returns an empty array on empty input', () => {
    expect(groupCommentsIntoThreads([])).toEqual([]);
  });

  it('produces one thread with zero replies for a lone root', () => {
    const c = comment({ id: 'c1' });
    const threads = groupCommentsIntoThreads([c]);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe('c1');
    expect(threads[0].replies).toEqual([]);
    expect(threads[0].isOrphan).toBe(false);
  });

  it('groups two replies under their root sorted by createdAt ascending', () => {
    const root = comment({
      id: 'root',
      createdAt: '2026-05-31T00:00:00.000Z',
    });
    const reply2 = comment({
      id: 'r2',
      replyTo: 'root',
      createdAt: '2026-05-31T00:02:00.000Z',
      text: 'second',
    });
    const reply1 = comment({
      id: 'r1',
      replyTo: 'root',
      createdAt: '2026-05-31T00:01:00.000Z',
      text: 'first',
    });
    const threads = groupCommentsIntoThreads([root, reply2, reply1]);
    expect(threads).toHaveLength(1);
    expect(threads[0].replies.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('marks a reply whose replyTo does not resolve as an orphan thread', () => {
    const ghost = comment({
      id: 'orphan-1',
      replyTo: 'does-not-exist',
      text: 'stranded reply',
    });
    const threads = groupCommentsIntoThreads([ghost]);
    expect(threads).toHaveLength(1);
    expect(threads[0].isOrphan).toBe(true);
    expect(threads[0].root.id).toBe('orphan-1');
    expect(threads[0].replies).toEqual([]);
  });

  it('flattens a reply-to-a-reply under the original root (single-level threading)', () => {
    const root = comment({ id: 'root' });
    const r1 = comment({
      id: 'r1',
      replyTo: 'root',
      createdAt: '2026-05-31T00:01:00.000Z',
    });
    // r2's replyTo points at r1 (a reply) — should still land under
    // root per the single-level threading contract.
    const r2 = comment({
      id: 'r2',
      replyTo: 'r1',
      createdAt: '2026-05-31T00:02:00.000Z',
    });
    const threads = groupCommentsIntoThreads([root, r1, r2]);
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe('root');
    expect(threads[0].replies.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('preserves input order across multiple roots', () => {
    const a = comment({ id: 'A' });
    const b = comment({ id: 'B' });
    const c = comment({ id: 'C' });
    const threads = groupCommentsIntoThreads([b, c, a]);
    expect(threads.map((t) => t.root.id)).toEqual(['B', 'C', 'A']);
  });

  it('places orphan threads after all real-root threads', () => {
    const root = comment({ id: 'root' });
    const orphan = comment({ id: 'orphan', replyTo: 'gone' });
    const threads = groupCommentsIntoThreads([orphan, root]);
    expect(threads).toHaveLength(2);
    // The real root keeps its input position relative to other
    // real roots; the orphan slots in at the end of the threads
    // array so a broken thread doesn't displace the operator's
    // reading order of legitimate threads.
    expect(threads[0].root.id).toBe('root');
    expect(threads[1].root.id).toBe('orphan');
    expect(threads[1].isOrphan).toBe(true);
  });

  it('treats a replyTo cycle as orphan (no infinite loop)', () => {
    // Cycles are forbidden by the storage contract but the parser
    // doesn't reject them; verify the renderer is defensive.
    const a = comment({ id: 'A', replyTo: 'B' });
    const b = comment({ id: 'B', replyTo: 'A' });
    const threads = groupCommentsIntoThreads([a, b]);
    // Both comments are replies (no root in the input) — they end
    // up as two orphan threads since the cycle never lands at a
    // root.
    expect(threads).toHaveLength(2);
    expect(threads.every((t) => t.isOrphan)).toBe(true);
  });

  it('treats a reply whose root is not present in the input as orphan', () => {
    // The root comment exists in storage but the studio's read path
    // only fetches the current entry's annotations; a reply whose
    // root lives elsewhere should render as orphan rather than
    // crash.
    const reply = comment({ id: 'r1', replyTo: 'elsewhere' });
    const threads = groupCommentsIntoThreads([reply]);
    expect(threads).toHaveLength(1);
    expect(threads[0].isOrphan).toBe(true);
  });
});

describe('threadHasReplies (Phase 8 Step 8.2.1 helper)', () => {
  it('returns true when replies.length > 0', () => {
    expect(
      threadHasReplies({
        root: comment({ id: 'r' }),
        replies: [comment({ id: 'a' })],
        isOrphan: false,
      }),
    ).toBe(true);
  });
  it('returns false on a lone root', () => {
    expect(
      threadHasReplies({
        root: comment({ id: 'r' }),
        replies: [],
        isOrphan: false,
      }),
    ).toBe(false);
  });
});

describe('replyCountLabel (Phase 8 Step 8.2.1 helper)', () => {
  it('uses singular form for exactly one reply', () => {
    expect(replyCountLabel(1)).toBe('1 reply');
  });
  it('uses plural form for two or more replies', () => {
    expect(replyCountLabel(2)).toBe('2 replies');
    expect(replyCountLabel(7)).toBe('7 replies');
  });
  it('returns empty string for non-positive counts', () => {
    expect(replyCountLabel(0)).toBe('');
    expect(replyCountLabel(-3)).toBe('');
  });
});
