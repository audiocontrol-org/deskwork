/**
 * Thread rendering for the entry-keyed press-check client (Phase 8
 * Task 8.2 Step 8.2.1+8.2.2 — sidebar-grouped placement).
 *
 * Renders one sidebar `<li>` per Thread:
 *   - Root comment via the existing `buildSidebarItem` (so all the
 *     existing per-card affordances — Resolve/Edit/Delete, addressed
 *     stamp expansion, hover-to-highlight — keep working unchanged
 *     on the root).
 *   - When the thread has 1+ replies, a "N replies" badge button is
 *     attached to the root card AND a collapsed `<ul>` of reply
 *     cards is appended inside the root `<li>`. Clicking the badge
 *     toggles the replies container's `hidden` attribute and flips
 *     `aria-pressed` on the badge.
 *   - When the thread is an orphan reply (replyTo doesn't resolve),
 *     the root card is the orphan reply itself; we add
 *     `data-orphan-reply="true"` on the `<li>` plus a small
 *     `.er-thread-orphan-label` chip explaining the broken thread.
 *
 * Per `.claude/rules/affordance-placement.md`: the reply-count badge
 * lives ON the root card (inside the card chrome, after the actions
 * row) — NOT in a toolbar. It's the canonical pattern from the
 * addressed-stamp diff toggle: a control that affects ONLY this
 * card's expansion state belongs on the card itself.
 *
 * Per Phase 8 Task 8.2 placement decision: this module implements
 * the sidebar-grouped direction; inline-on-pin would replace this
 * module's render path (not extend it). The decision is documented
 * in `threads.ts`'s file header so a future operator can grep for
 * the choice point.
 */

import { buildSidebarItem, type BuildSidebarItemDeps } from './sidebar-render.ts';
import { replyCountLabel, type Thread } from './threads.ts';
import type { AnnotationStatus, CommentAnnotation } from './state.ts';
import { cssEscapeForSelector } from './css-escape.ts';

export interface BuildSidebarThreadDeps extends BuildSidebarItemDeps {
  /**
   * Per-reply Resolve / Edit / Delete callbacks reuse the same
   * surface as the root's. The caller passes the same handler set
   * (`buildSidebarItem` invocations underneath wire identical
   * behavior to every reply card). The thread renderer doesn't
   * introduce new affordances on the reply chrome itself.
   */
}

/**
 * Build a sidebar `<li>` for an entire thread. Root + collapsed
 * replies + reply-count badge. Returns the root `<li>` with reply
 * children attached inside.
 */
export function buildSidebarThread(
  thread: Thread,
  status: AnnotationStatus,
  deps: BuildSidebarThreadDeps,
): HTMLElement {
  const rootLi = buildSidebarItem(thread.root, status, deps);

  if (thread.isOrphan) {
    markOrphan(rootLi);
  }

  if (thread.replies.length > 0) {
    const repliesContainer = buildRepliesContainer(thread.replies, status, deps);
    const badge = buildReplyBadge(thread.replies.length, repliesContainer, rootLi);
    // Place the badge inside the actions row so it lives with the
    // other per-card buttons (Resolve / Edit / Delete) — the
    // existing actions row is the natural home for per-card chrome.
    const actions = rootLi.querySelector<HTMLElement>('.er-marginalia-actions');
    if (actions !== null) {
      actions.appendChild(badge);
    } else {
      rootLi.appendChild(badge);
    }
    rootLi.appendChild(repliesContainer);
    rootLi.dataset.hasReplies = 'true';
    rootLi.dataset.replyCount = String(thread.replies.length);
  }

  return rootLi;
}

function markOrphan(li: HTMLElement): void {
  li.dataset.orphanReply = 'true';
  const label = document.createElement('div');
  label.className = 'er-thread-orphan-label';
  label.textContent = 'parent comment not found';
  label.title = 'This reply points at a comment that is no longer in this entry.';
  // Insert at the very top of the card so the orphan state is the
  // first thing the operator sees on the card chrome — same shape
  // as the rebased / unresolved status markers above each card.
  li.insertBefore(label, li.firstChild);
}

function buildRepliesContainer(
  replies: readonly CommentAnnotation[],
  status: AnnotationStatus,
  deps: BuildSidebarThreadDeps,
): HTMLElement {
  const container = document.createElement('ul');
  container.className = 'er-marginalia-thread-replies';
  container.hidden = true;
  for (const reply of replies) {
    const replyLi = buildSidebarItem(reply, status, deps);
    replyLi.classList.add('er-marginalia-item--reply');
    replyLi.dataset.replyTo = reply.replyTo ?? '';
    container.appendChild(replyLi);
  }
  return container;
}

function buildReplyBadge(
  count: number,
  repliesContainer: HTMLElement,
  rootLi: HTMLElement,
): HTMLButtonElement {
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'er-marginalia-action er-marginalia-thread-toggle';
  badge.dataset.action = 'toggle-thread';
  badge.setAttribute('aria-pressed', 'false');
  badge.textContent = replyCountLabel(count);
  badge.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleThreadExpansion(badge, repliesContainer, rootLi);
  });
  return badge;
}

function toggleThreadExpansion(
  badge: HTMLButtonElement,
  repliesContainer: HTMLElement,
  rootLi: HTMLElement,
): void {
  const expanded = !repliesContainer.hidden;
  if (expanded) {
    repliesContainer.hidden = true;
    badge.setAttribute('aria-pressed', 'false');
    delete rootLi.dataset.threadExpanded;
  } else {
    repliesContainer.hidden = false;
    badge.setAttribute('aria-pressed', 'true');
    rootLi.dataset.threadExpanded = 'true';
  }
}

/**
 * Programmatically expand a thread by its root comment's id. Used
 * by the hash-permalink handler (Step 8.2.3) so navigating to
 * `#comment/<root-id>` reveals replies even when the operator
 * hasn't clicked the badge.
 *
 * Returns true when expansion ran; false when the root has no
 * replies or no badge was found.
 */
export function expandThreadForRoot(rootLi: HTMLElement): boolean {
  if (rootLi.dataset.hasReplies !== 'true') return false;
  const badge = rootLi.querySelector<HTMLButtonElement>(
    '.er-marginalia-thread-toggle',
  );
  const replies = rootLi.querySelector<HTMLElement>(
    '.er-marginalia-thread-replies',
  );
  if (badge === null || replies === null) return false;
  if (!replies.hidden) return true;
  replies.hidden = false;
  badge.setAttribute('aria-pressed', 'true');
  rootLi.dataset.threadExpanded = 'true';
  return true;
}

/**
 * Find the sidebar `<li>` for a given comment id — root or reply.
 * Returns the root `<li>` of the thread the comment belongs to.
 * Used by the hash-permalink handler to scroll AND expand the
 * thread that contains the target comment id.
 */
export function findThreadRootByCommentId(
  sidebarList: HTMLElement,
  commentId: string,
): HTMLElement | null {
  const direct = sidebarList.querySelector<HTMLElement>(
    `.er-marginalia-item[data-annotation-id="${cssEscapeForSelector(commentId)}"]`,
  );
  if (direct === null) return null;
  // Walk up to the nearest non-reply sidebar item (the thread root).
  const closest = direct.closest<HTMLElement>(
    '.er-marginalia-item:not(.er-marginalia-item--reply)',
  );
  return closest ?? direct;
}
