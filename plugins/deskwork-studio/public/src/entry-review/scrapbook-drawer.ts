/**
 * Scrapbook drawer toggle for the entry-keyed press-check client
 * (Phase 34a — T14 client wiring).
 *
 * The scrapbook drawer (server-rendered via
 * `pages/review-scrapbook-drawer.ts`) is collapsed by default; clicking
 * the handle (or pressing Enter/Space when the header has focus)
 * expands it. The state lives on `body[data-drawer]` so the CSS height
 * transition (4rem ↔ 22rem) is the single source of truth for the
 * visual state.
 *
 * Edge case: the standalone-viewer link inside the handle has its own
 * `event.stopPropagation()`; the same belt-and-braces guard checks the
 * click target so descendant interactive controls handle their own
 * behavior without double-firing.
 */

export function initScrapbookDrawerToggle(): void {
  function setDrawerState(open: boolean): void {
    document.body.dataset.drawer = open ? 'open' : 'closed';
    const handle = document.querySelector<HTMLElement>(
      '.er-scrapbook-drawer-handle[data-drawer-toggle]',
    );
    if (handle) handle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = document.querySelector<HTMLElement>('[data-toggle-label]');
    if (label) label.textContent = open ? 'Collapse' : 'Expand';
  }

  if (document.body.dataset.drawer === undefined) {
    document.body.dataset.drawer = 'closed';
  }

  const togglers = document.querySelectorAll<HTMLElement>('[data-drawer-toggle]');
  togglers.forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (el.tagName === 'HEADER') {
        const target = ev.target instanceof Element ? ev.target : null;
        if (target?.closest('.er-scrapbook-drawer-toggle, .er-scrapbook-drawer-open')) {
          return;
        }
      }
      const next = document.body.dataset.drawer !== 'open';
      setDrawerState(next);
    });
    if (el.tagName === 'HEADER') {
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          const next = document.body.dataset.drawer !== 'open';
          setDrawerState(next);
        }
      });
    }
  });
}
