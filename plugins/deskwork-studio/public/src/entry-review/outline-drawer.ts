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

  return { available, open, close, toggle, isOpen };
}
