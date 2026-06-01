/**
 * @vitest-environment jsdom
 *
 * Phase 8 Task 8.2 Step 8.2.1 + 8.2.2 — thread rendering tests for
 * `buildSidebarThread`. Covers:
 *
 *   - Lone root → no badge, no replies container.
 *   - Root + replies → reply-count badge, collapsed replies
 *     container (`hidden=true` initially).
 *   - Click the badge → replies container becomes visible AND
 *     `aria-pressed` flips to `true`. Click again → reverts.
 *   - Orphan reply marker: `data-orphan-reply="true"` + a label
 *     explaining the broken-thread state.
 *   - Reply cards reuse the same per-card chrome (Resolve / Edit /
 *     Delete) as roots — the addressed-badge expand path
 *     (Step 8.6.1) keeps working on reply cards.
 *
 * Per `.claude/rules/affordance-placement.md`: the reply-count
 * badge is part of the root card's actions row (component-attached,
 * not toolbar-attached). The test asserts that placement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSidebarThread } from '../../../../plugins/deskwork-studio/public/src/entry-review/thread-render.ts';
import {
  type DiffSliceFetcher,
  type DiffSlicePayload,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts';
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

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('buildSidebarThread (Phase 8 Step 8.2.1+8.2.2)', () => {
  it('renders a lone-root thread without a reply-count badge or replies container', () => {
    const thread: Thread = {
      root: comment({ id: 'root' }),
      replies: [],
      isOrphan: false,
    };
    const li = buildSidebarThread(thread, 'current', makeDeps());
    document.body.appendChild(li);

    expect(li.querySelector('.er-marginalia-thread-toggle')).toBeNull();
    expect(li.querySelector('.er-marginalia-thread-replies')).toBeNull();
    expect(li.dataset.hasReplies).toBeUndefined();
  });

  it('renders a reply-count badge inside the root actions row (component-attached affordance)', () => {
    const thread: Thread = {
      root: comment({ id: 'root' }),
      replies: [comment({ id: 'r1', replyTo: 'root' })],
      isOrphan: false,
    };
    const li = buildSidebarThread(thread, 'current', makeDeps());
    document.body.appendChild(li);

    const actions = li.querySelector('.er-marginalia-actions');
    const badge = li.querySelector('.er-marginalia-thread-toggle');
    expect(actions).not.toBeNull();
    expect(badge).not.toBeNull();
    // Affordance-placement gate: badge MUST live inside the actions
    // row, NOT in a toolbar somewhere on the page.
    expect(actions?.contains(badge as Node)).toBe(true);
    expect(badge?.textContent).toBe('1 reply');
    expect(badge?.getAttribute('aria-pressed')).toBe('false');
    expect(li.dataset.hasReplies).toBe('true');
    expect(li.dataset.replyCount).toBe('1');
  });

  it('starts with the replies container hidden (default-collapsed)', () => {
    const thread: Thread = {
      root: comment({ id: 'root' }),
      replies: [
        comment({ id: 'r1', replyTo: 'root' }),
        comment({
          id: 'r2',
          replyTo: 'root',
          createdAt: '2026-05-31T00:02:00.000Z',
        }),
      ],
      isOrphan: false,
    };
    const li = buildSidebarThread(thread, 'current', makeDeps());
    document.body.appendChild(li);

    const container = li.querySelector<HTMLElement>('.er-marginalia-thread-replies');
    expect(container).not.toBeNull();
    expect(container?.hidden).toBe(true);
    // Both replies rendered as child cards.
    const replyCards = container?.querySelectorAll('.er-marginalia-item--reply');
    expect(replyCards?.length).toBe(2);
  });

  it('expands the thread on badge click and collapses on a second click', () => {
    const thread: Thread = {
      root: comment({ id: 'root' }),
      replies: [comment({ id: 'r1', replyTo: 'root' })],
      isOrphan: false,
    };
    const li = buildSidebarThread(thread, 'current', makeDeps());
    document.body.appendChild(li);

    const badge = li.querySelector<HTMLButtonElement>('.er-marginalia-thread-toggle');
    const container = li.querySelector<HTMLElement>('.er-marginalia-thread-replies');
    expect(badge).not.toBeNull();
    expect(container).not.toBeNull();
    if (badge === null || container === null) return;

    badge.click();
    expect(container.hidden).toBe(false);
    expect(badge.getAttribute('aria-pressed')).toBe('true');
    expect(li.dataset.threadExpanded).toBe('true');

    badge.click();
    expect(container.hidden).toBe(true);
    expect(badge.getAttribute('aria-pressed')).toBe('false');
    expect(li.dataset.threadExpanded).toBeUndefined();
  });

  it('marks an orphan-reply thread with data-orphan-reply + an explanatory label', () => {
    const orphan = comment({ id: 'orphan-1', replyTo: 'unknown-parent' });
    const thread: Thread = {
      root: orphan,
      replies: [],
      isOrphan: true,
    };
    const li = buildSidebarThread(thread, 'current', makeDeps());
    document.body.appendChild(li);

    expect(li.dataset.orphanReply).toBe('true');
    const label = li.querySelector('.er-thread-orphan-label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('parent comment not found');
  });

  it('replies render with the same per-card chrome as roots (Resolve / Edit / Delete buttons)', () => {
    const thread: Thread = {
      root: comment({ id: 'root' }),
      replies: [comment({ id: 'r1', replyTo: 'root' })],
      isOrphan: false,
    };
    const li = buildSidebarThread(thread, 'current', makeDeps());
    document.body.appendChild(li);

    const replyCard = li.querySelector<HTMLElement>('.er-marginalia-item--reply');
    expect(replyCard).not.toBeNull();
    // The same Resolve / Edit / Delete affordances render on the
    // reply — the per-card actions row is what the existing edit /
    // delete handlers attach to.
    expect(replyCard?.querySelector('[data-action="resolve-comment"]')).not.toBeNull();
    expect(replyCard?.querySelector('[data-action="edit-comment"]')).not.toBeNull();
    expect(replyCard?.querySelector('[data-action="delete-comment"]')).not.toBeNull();
  });

  it('reply cards expose the addressed-badge expand path when the reply itself is addressed', async () => {
    // Step 8.6.1 affordance must work on reply cards too — a reply
    // can itself be addressed (its own disposition annotation),
    // independent of whether the root was addressed.
    const replyAddr: AddressAnnotation = {
      id: 'a-r1',
      type: 'address',
      workflowId: 'entry-uuid',
      commentId: 'r1',
      version: 3,
      disposition: 'addressed',
      createdAt: '2026-05-31T00:05:00.000Z',
      reason: 'reply was acted on in a later revision',
    };
    const addressByCommentId = new Map<string, AddressAnnotation>([
      ['r1', replyAddr],
    ]);
    const fetcher: DiffSliceFetcher = vi.fn(() =>
      Promise.resolve<DiffSlicePayload>({
        reason: 'reply was acted on in a later revision',
        hunks: [],
        notes: 'first revision after the reply',
      }),
    );
    const draftBody = document.createElement('div');
    document.body.appendChild(draftBody);
    const thread: Thread = {
      root: comment({ id: 'root' }),
      replies: [comment({ id: 'r1', replyTo: 'root' })],
      isOrphan: false,
    };
    const li = buildSidebarThread(thread, 'current', {
      draftBody,
      addressByCommentId,
      fetchDiffSlice: fetcher,
      onResolve: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onHoverEnter: vi.fn(),
      onHoverLeave: vi.fn(),
      onScrollTo: vi.fn(),
    });
    document.body.appendChild(li);

    const replyCard = li.querySelector<HTMLElement>('.er-marginalia-item--reply');
    expect(replyCard).not.toBeNull();
    const stamp = replyCard?.querySelector<HTMLElement>('.er-marginalia-stamp');
    expect(stamp).not.toBeNull();
    expect(stamp?.getAttribute('role')).toBe('button');
    expect(stamp?.dataset.expandable).toBe('true');

    stamp?.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetcher).toHaveBeenCalledWith('r1', 3);
    expect(replyCard?.querySelector('.er-marginalia-diff-expansion')).not.toBeNull();
  });
});
