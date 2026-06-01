/**
 * @vitest-environment jsdom
 *
 * Phase 8 Task 8.2 Step 8.2.3 — comment-thread permalinks.
 *
 * Spec: `/dev/editorial-review/entry/<uuid>#comment/<comment-id>`
 * scrolls to the thread AND expands it (when the target comment
 * has replies, or is itself a reply inside an existing thread).
 *
 * The hash parsing + scroll live inside the annotations controller
 * (`maybeApplyHashPermalink` private function); this test suite
 * exercises the two thread-render primitives the permalink handler
 * relies on:
 *
 *   - `findThreadRootByCommentId(sidebarList, commentId)`:
 *     returns the thread root `<li>` for a given comment id,
 *     walking up from a reply card to its enclosing root if
 *     needed.
 *
 *   - `expandThreadForRoot(rootLi)`:
 *     programmatically opens the replies container + flips the
 *     badge's aria-pressed when the root has replies. No-op
 *     otherwise.
 *
 * Together these are the load-bearing piece of "scroll to and
 * expand the thread on permalink load."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildSidebarThread,
  expandThreadForRoot,
  findThreadRootByCommentId,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/thread-render.ts';
import type {
  AddressAnnotation,
  CommentAnnotation,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/state.ts';
import type { Thread } from '../../../../plugins/deskwork-studio/public/src/entry-review/threads.ts';

function comment(over: Partial<CommentAnnotation> = {}): CommentAnnotation {
  return {
    id: over.id ?? 'c1',
    type: 'comment',
    workflowId: 'entry-uuid',
    version: 1,
    range: { start: 0, end: 5 },
    text: over.text ?? 'a comment',
    createdAt: over.createdAt ?? '2026-05-31T00:00:00.000Z',
    ...over,
  };
}

function makeDeps(): Parameters<typeof buildSidebarThread>[2] {
  const draftBody = document.createElement('div');
  document.body.appendChild(draftBody);
  return {
    draftBody,
    addressByCommentId: new Map<string, AddressAnnotation>(),
    onResolve: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onHoverEnter: vi.fn(),
    onHoverLeave: vi.fn(),
    onScrollTo: vi.fn(),
  };
}

function sidebarWithThreads(threads: readonly Thread[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'er-marginalia-list';
  for (const t of threads) {
    list.appendChild(buildSidebarThread(t, 'current', makeDeps()));
  }
  document.body.appendChild(list);
  return list;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findThreadRootByCommentId (Phase 8 Step 8.2.3)', () => {
  it('returns the root <li> when the target id IS the root', () => {
    const list = sidebarWithThreads([
      { root: comment({ id: 'root-a' }), replies: [], isOrphan: false },
      { root: comment({ id: 'root-b' }), replies: [], isOrphan: false },
    ]);
    const rootLi = findThreadRootByCommentId(list, 'root-b');
    expect(rootLi).not.toBeNull();
    expect(rootLi?.dataset.annotationId).toBe('root-b');
  });

  it('returns the enclosing root <li> when the target id is a reply', () => {
    const list = sidebarWithThreads([
      {
        root: comment({ id: 'root-a' }),
        replies: [comment({ id: 'reply-1', replyTo: 'root-a' })],
        isOrphan: false,
      },
    ]);
    const rootLi = findThreadRootByCommentId(list, 'reply-1');
    expect(rootLi).not.toBeNull();
    expect(rootLi?.dataset.annotationId).toBe('root-a');
    expect(rootLi?.classList.contains('er-marginalia-item--reply')).toBe(false);
  });

  it('returns null when the comment id is not in the sidebar', () => {
    const list = sidebarWithThreads([
      { root: comment({ id: 'root-a' }), replies: [], isOrphan: false },
    ]);
    const rootLi = findThreadRootByCommentId(list, 'no-such-id');
    expect(rootLi).toBeNull();
  });
});

describe('expandThreadForRoot (Phase 8 Step 8.2.3)', () => {
  it('opens the replies container + flips aria-pressed when the root has replies', () => {
    const list = sidebarWithThreads([
      {
        root: comment({ id: 'root-a' }),
        replies: [comment({ id: 'reply-1', replyTo: 'root-a' })],
        isOrphan: false,
      },
    ]);
    const rootLi = list.querySelector<HTMLElement>('.er-marginalia-item');
    if (rootLi === null) throw new Error('rootLi');

    // Pre-condition — collapsed.
    const repliesContainer = rootLi.querySelector<HTMLElement>(
      '.er-marginalia-thread-replies',
    );
    const badge = rootLi.querySelector<HTMLElement>('.er-marginalia-thread-toggle');
    expect(repliesContainer?.hidden).toBe(true);
    expect(badge?.getAttribute('aria-pressed')).toBe('false');

    const expanded = expandThreadForRoot(rootLi);
    expect(expanded).toBe(true);
    expect(repliesContainer?.hidden).toBe(false);
    expect(badge?.getAttribute('aria-pressed')).toBe('true');
    expect(rootLi.dataset.threadExpanded).toBe('true');
  });

  it('is idempotent — calling it on an already-expanded thread is a no-op', () => {
    const list = sidebarWithThreads([
      {
        root: comment({ id: 'root-a' }),
        replies: [comment({ id: 'reply-1', replyTo: 'root-a' })],
        isOrphan: false,
      },
    ]);
    const rootLi = list.querySelector<HTMLElement>('.er-marginalia-item');
    if (rootLi === null) throw new Error('rootLi');

    expandThreadForRoot(rootLi);
    const result = expandThreadForRoot(rootLi);
    expect(result).toBe(true);
    const repliesContainer = rootLi.querySelector<HTMLElement>(
      '.er-marginalia-thread-replies',
    );
    expect(repliesContainer?.hidden).toBe(false);
  });

  it('returns false when the root has no replies (nothing to expand)', () => {
    const list = sidebarWithThreads([
      { root: comment({ id: 'root-a' }), replies: [], isOrphan: false },
    ]);
    const rootLi = list.querySelector<HTMLElement>('.er-marginalia-item');
    if (rootLi === null) throw new Error('rootLi');
    expect(expandThreadForRoot(rootLi)).toBe(false);
  });

  it('end-to-end: looking up a reply by id and expanding lands on the root opened', () => {
    // This mirrors the permalink handler's two-call sequence:
    //   1) findThreadRootByCommentId(list, idFromHash) → rootLi
    //   2) expandThreadForRoot(rootLi)
    // Assert the integrated behavior so a future refactor of either
    // primitive can't silently break the permalink path.
    const list = sidebarWithThreads([
      {
        root: comment({ id: 'root-a' }),
        replies: [
          comment({ id: 'reply-1', replyTo: 'root-a' }),
          comment({
            id: 'reply-2',
            replyTo: 'root-a',
            createdAt: '2026-05-31T00:01:00.000Z',
          }),
        ],
        isOrphan: false,
      },
    ]);

    const rootLi = findThreadRootByCommentId(list, 'reply-2');
    expect(rootLi).not.toBeNull();
    if (rootLi === null) return;
    const expanded = expandThreadForRoot(rootLi);
    expect(expanded).toBe(true);

    const repliesContainer = rootLi.querySelector<HTMLElement>(
      '.er-marginalia-thread-replies',
    );
    expect(repliesContainer?.hidden).toBe(false);
    expect(rootLi.dataset.threadExpanded).toBe('true');
  });
});
