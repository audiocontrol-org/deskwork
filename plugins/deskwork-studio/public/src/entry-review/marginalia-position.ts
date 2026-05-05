/**
 * Vertical alignment for marginalia items (#190).
 *
 * Each `<li.er-marginalia-item>` in the sidebar gets positioned absolutely
 * inside `.er-marginalia-list` so its top edge lines up with the top of
 * the corresponding `<mark data-annotation-id>` in the article body —
 * the operator's eye should slide horizontally from a highlighted run
 * to its margin note without having to scan vertically. Anything else
 * is chaos (operator's framing, verbatim).
 *
 * Two collisions to handle:
 *
 *   1. Items whose marks would overlap: we sort anchored items by
 *      target-top ascending and cascade later items downward by their
 *      height + a small gap so they never sit on top of each other.
 *   2. Unanchored items (legacy comments whose anchor couldn't rebase
 *      onto the current text): they have no mark to align to. We append
 *      them after all anchored items at the bottom of the list.
 *
 * Self-maintenance via observers — repositioning fires on:
 *
 *   - sidebar list mutations (add / remove / re-render of items)
 *   - draft body resizes (font load, edit-mode toggle, viewport resize)
 *   - window resize (bubbles into both observers but cheaper to wire
 *     directly than to depend on observer order-of-fire)
 *
 * `requestAnimationFrame` debounce coalesces bursts (e.g. `loadAnnotations`
 * appending many items in a single tick) into a single layout pass.
 *
 * The `.er-marginalia-resolved` footer is appended to the parent `<aside>`,
 * NOT the list, so it stays in normal flow below the list. We expand
 * the list's `min-height` to encompass the deepest absolute item so the
 * resolved footer rides below the last visible mark.
 */

const COLLISION_GAP = 8;

/**
 * One pass: read every item's target top from its mark, cascade to
 * resolve collisions, and apply absolute positions.
 *
 * Idempotent. Safe to call repeatedly. Items with no matching mark
 * (status === 'unresolved') are stacked after all anchored items.
 */
export function positionMarginaliaItems(
  draftBody: HTMLElement,
  sidebarList: HTMLElement,
): void {
  const items = Array.from(
    sidebarList.querySelectorAll<HTMLElement>('.er-marginalia-item'),
  );
  if (items.length === 0) {
    sidebarList.style.minHeight = '';
    return;
  }

  // Reset any previous absolute positioning before measuring so
  // `getBoundingClientRect` reads the natural list-top, not a top
  // that was already pinned by us in a prior pass.
  for (const item of items) {
    item.style.position = '';
    item.style.top = '';
    item.style.left = '';
    item.style.right = '';
  }
  sidebarList.style.position = 'relative';

  const listRect = sidebarList.getBoundingClientRect();
  const anchored: { el: HTMLElement; targetTop: number; height: number }[] = [];
  const unanchored: HTMLElement[] = [];

  for (const item of items) {
    const id = item.dataset.annotationId;
    if (!id) continue;
    const mark = draftBody.querySelector<HTMLElement>(
      `mark[data-annotation-id="${CSS.escape(id)}"]`,
    );
    if (mark) {
      const markRect = mark.getBoundingClientRect();
      anchored.push({
        el: item,
        targetTop: markRect.top - listRect.top,
        height: item.offsetHeight,
      });
    } else {
      unanchored.push(item);
    }
  }

  anchored.sort((a, b) => a.targetTop - b.targetTop);

  let nextMinTop = 0;
  for (const p of anchored) {
    const top = Math.max(p.targetTop, nextMinTop);
    p.el.style.position = 'absolute';
    p.el.style.left = '0';
    p.el.style.right = '0';
    p.el.style.top = `${top}px`;
    nextMinTop = top + p.height + COLLISION_GAP;
  }

  for (const u of unanchored) {
    u.style.position = 'absolute';
    u.style.left = '0';
    u.style.right = '0';
    u.style.top = `${nextMinTop}px`;
    nextMinTop += u.offsetHeight + COLLISION_GAP;
  }

  sidebarList.style.minHeight = `${nextMinTop}px`;
}

export interface MarginaliaPositioning {
  /** Manually request a reposition (e.g. after a programmatic mutation
   *  the observers can't see, like a focus-mode transition that
   *  resizes the article body before its content reflows). */
  reposition: () => void;
  /** Tear down observers — currently only used in tests. */
  teardown: () => void;
}

/**
 * Wire MutationObserver + ResizeObserver to keep marginalia items
 * aligned with their marks across the page's lifecycle. Returns a
 * `reposition()` for manual calls and a `teardown()` for symmetry.
 */
export function wireMarginaliaPositioning(
  draftBody: HTMLElement,
  sidebarList: HTMLElement,
): MarginaliaPositioning {
  let pending = false;
  function schedule(): void {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      positionMarginaliaItems(draftBody, sidebarList);
    });
  }

  const sidebarObserver = new MutationObserver(schedule);
  sidebarObserver.observe(sidebarList, { childList: true });

  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(draftBody);

  window.addEventListener('resize', schedule);

  // Initial pass — covers the case where items were added before the
  // observer was installed (loadAnnotations runs after wiring today,
  // but defensive against future reordering).
  schedule();

  return {
    reposition: schedule,
    teardown: () => {
      sidebarObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', schedule);
    },
  };
}
