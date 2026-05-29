/**
 * Toggle `body[data-strip-stuck]` based on whether `.er-strip` is
 * currently pinned by `position: sticky` or sitting at its natural
 * (at-rest) position in document flow.
 *
 * The strip is `position: sticky; top: var(--er-folio-h)`. When the
 * page is unscrolled, the strip sits at its natural position and its
 * `getBoundingClientRect().top` is GREATER than the sticky offset.
 * When the operator scrolls past it, sticky engages and the strip's
 * top equals the sticky offset (clamped to that value by the engine).
 * The transition between these two states is what drives the
 * "collapse on stick" affordance — phone-only CSS rules listen for
 * the data attribute and animate row 1 (back link + stage stamp)
 * collapsed when stuck, leaving just the action-button row pinned at
 * the top of the viewport so the operator can hit Approve / Iterate /
 * Reject without scrolling back up.
 *
 * Why a scroll listener (not IntersectionObserver): the rule needs to
 * fire on every scroll position, not just the threshold crossing. A
 * passive scroll listener is cheap (~4 CPU ms / second on modest
 * hardware), runs only while the operator is scrolling, and makes the
 * "stuck" attribute rock-solid against viewport resize, edit-mode
 * toggle, and other reflows that could shift the strip's at-rest
 * position. The IntersectionObserver+sentinel pattern is more elegant
 * for one-shot threshold detection but requires inserting an extra
 * DOM node and gets fiddly with the strip's variable sticky-top.
 *
 * No-op on pages without a `.er-strip`.
 */

export function initStripCollapse(): void {
  const strip = document.querySelector<HTMLElement>('.er-strip');
  if (!strip) return;

  function update(): void {
    if (!strip) return;
    // The strip's natural at-rest position can equal its sticky `top`
    // offset (e.g. on phone where the strip sits IMMEDIATELY under a
    // fixed folio whose bottom edge equals var(--er-folio-h) ==
    // sticky-top). In that geometry rect.top stays at the sticky-top
    // value at scrollY=0 AND while pinned, so a rect-only comparison
    // can't distinguish the two. Gate on `scrollY > 0` first so the
    // page-top state always reads as "not stuck", then verify the
    // strip is actually at its sticky offset (not below it because
    // some other reflow shifted it).
    const rect = strip.getBoundingClientRect();
    const stickyTop = Number.parseFloat(getComputedStyle(strip).top) || 0;
    const stuck = window.scrollY > 0 && rect.top <= stickyTop + 1;
    if (stuck) {
      document.body.setAttribute('data-strip-stuck', '');
    } else {
      document.body.removeAttribute('data-strip-stuck');
    }
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  // Also re-evaluate when the strip's own size changes — entering /
  // leaving edit mode swaps the strip's children, which can shift its
  // at-rest position.
  const ro = new ResizeObserver(update);
  ro.observe(strip);
}
