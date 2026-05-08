/**
 * Outline drawer toggle for the entry-keyed press-check client
 * (Phase 34a — T9 client wiring).
 *
 * Wires the three affordances:
 *   - `.er-outline-tab` pull tab on the left edge of the viewport.
 *   - `[data-outline-close]` × button inside the drawer head.
 *   - `[data-action="outline-drawer"]` button in the edit toolbar.
 *
 * All three dispatch through the same `toggleOutlineDrawer` handler.
 */

interface OutlineDrawerController {
  available: () => boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
}

export function initOutlineDrawer(): OutlineDrawerController {
  function getDrawer(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-outline-drawer]');
  }
  function getTab(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('[data-outline-tab]');
  }
  function getToolbarBtn(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('[data-action="outline-drawer"]');
  }

  function available(): boolean {
    const tab = getTab();
    return !!tab && !tab.hidden;
  }

  function open(): void {
    const drawer = getDrawer();
    if (!drawer) return;
    drawer.hidden = false;
    drawer.classList.add('er-outline-drawer--open');
    getTab()?.classList.add('er-outline-tab--stowed');
    getToolbarBtn()?.setAttribute('aria-pressed', 'true');
  }

  function close(): void {
    const drawer = getDrawer();
    if (!drawer) return;
    drawer.classList.remove('er-outline-drawer--open');
    getTab()?.classList.remove('er-outline-tab--stowed');
    getToolbarBtn()?.setAttribute('aria-pressed', 'false');
    setTimeout(() => { drawer.hidden = true; }, 260);
  }

  function isOpen(): boolean {
    const drawer = getDrawer();
    return !!drawer && drawer.classList.contains('er-outline-drawer--open');
  }

  function toggle(): void {
    if (isOpen()) close();
    else open();
  }

  getTab()?.addEventListener('click', open);
  document.querySelector<HTMLButtonElement>('[data-outline-close]')
    ?.addEventListener('click', close);
  getToolbarBtn()?.addEventListener('click', toggle);

  // #244 — TOC scroll-spy + click-to-close on phone.
  initTocSpy();
  initTocClickClose(close);

  return { available, open, close, toggle, isOpen };
}

/**
 * Highlight the TOC entry whose target heading is currently nearest the
 * top of the viewport. IntersectionObserver fires whenever a tracked
 * heading crosses the observed band; we pick the nearest-to-top still-
 * visible heading and mark its TOC link active.
 *
 * The observed band is a slim slice ~80px below the top of the viewport
 * — far enough below the strip / toolbar chrome that the active
 * heading reads as "the section I'm looking at," not "the section
 * that just scrolled past." Falls back gracefully when the TOC isn't
 * present.
 */
function initTocSpy(): void {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'));
  if (links.length === 0) return;

  const linkById = new Map<string, HTMLAnchorElement>();
  for (const link of links) {
    const id = link.getAttribute('href')?.slice(1);
    if (id) linkById.set(id, link);
  }

  const headings = links
    .map((l) => {
      const id = l.getAttribute('href')?.slice(1);
      return id ? document.getElementById(id) : null;
    })
    .filter((el): el is HTMLElement => el !== null);
  if (headings.length === 0) return;

  let activeId: string | null = null;
  function setActive(id: string | null): void {
    if (id === activeId) return;
    if (activeId) linkById.get(activeId)?.classList.remove('is-active');
    activeId = id;
    if (id) linkById.get(id)?.classList.add('is-active');
  }

  // Track each heading's "topness" — distance from the top of the
  // viewport, with negative values for headings already scrolled past.
  // Active = nearest-to-top heading whose top is at or above a 100px
  // offset (the chrome reservation). Re-evaluate on scroll + resize.
  function updateActive(): void {
    const offset = 100;
    let best: { id: string; top: number } | null = null;
    for (const h of headings) {
      const top = h.getBoundingClientRect().top;
      if (top - offset > 0) continue; // not yet reached
      if (!best || top > best.top) best = { id: h.id, top };
    }
    setActive(best ? best.id : headings[0]?.id ?? null);
  }

  let raf = 0;
  function schedule(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateActive();
    });
  }
  document.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  updateActive();
}

/**
 * On phone (coarse pointer), close the drawer when the operator taps
 * a TOC link. The link's native anchor behavior fires first; we
 * follow up by closing the drawer so the heading is visible. On
 * desktop the drawer is wide enough that closing isn't required —
 * the operator can keep navigating without dismissing the drawer.
 */
function initTocClickClose(close: () => void): void {
  const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (!isCoarse) return;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')) {
    link.addEventListener('click', () => {
      // Defer one frame so the browser's anchor-jump runs first.
      requestAnimationFrame(() => close());
    });
  }
}
