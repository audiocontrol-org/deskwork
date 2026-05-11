/**
 * Client controller for the dashboard row's v0.20 affordance chrome.
 *
 * Wires two surfaces:
 *
 *   1. **Overflow menu** (`.er-row-menu`) — opened by tapping the `⋮`
 *      button (`[data-row-overflow]`). Visible on both desktop and
 *      mobile. Click-outside / Escape closes. Arrow-keys navigate
 *      between menu items.
 *
 *   2. **Swipe drawer** (`.er-row-drawer`) — mobile-only (matchMedia
 *      `<=600px`). Touch-drag the row foreground left to reveal the
 *      drawer; release past the threshold latches it open. Tap the
 *      row body, swipe right, or scroll away closes.
 *
 * Single-open invariant: opening a menu or drawer on one row closes any
 * other open menu/drawer. Drawer + menu are mutually exclusive on the
 * same row (opening one closes the other).
 *
 * All verb chips and menu items use the existing `data-copy` (clipboard)
 * or `data-href` (navigate) attributes. `data-copy` items route through
 * the existing `er-copy-btn` controller in `editorial-studio-client.ts`;
 * this controller fires for `data-href` items only (the navigation case)
 * and otherwise leaves clipboard handling to the existing wiring.
 */

import { copyOrShowFallback } from '../clipboard.ts';

const MOBILE_QUERY = '(max-width: 600px)';
const SWIPE_THRESHOLD_PX = 60;
const COPIED_FLASH_MS = 1500;

function isMobile(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** All currently-open menus + swiped rows; closing any closes all. */
const openSurfaces = new Set<HTMLElement>();

function closeAllSurfaces(): void {
  for (const el of openSurfaces) closeSurface(el);
}

function closeSurface(shell: HTMLElement): void {
  const menu = shell.querySelector<HTMLElement>('.er-row-menu');
  const overflow = shell.querySelector<HTMLButtonElement>('[data-row-overflow]');
  const fg = shell.querySelector<HTMLElement>('.er-row-fg');
  if (menu) menu.hidden = true;
  if (overflow) overflow.setAttribute('aria-expanded', 'false');
  if (fg) fg.style.transform = '';
  shell.classList.remove('is-menu-open', 'is-swiped');
  openSurfaces.delete(shell);
}

function openMenu(shell: HTMLElement): void {
  closeAllSurfaces();
  const menu = shell.querySelector<HTMLElement>('.er-row-menu');
  const overflow = shell.querySelector<HTMLButtonElement>('[data-row-overflow]');
  if (!menu || !overflow) return;
  menu.hidden = false;
  overflow.setAttribute('aria-expanded', 'true');
  shell.classList.add('is-menu-open');
  openSurfaces.add(shell);
  // Focus first menu item for keyboard users.
  const firstItem = menu.querySelector<HTMLElement>('.er-row-menu-item');
  firstItem?.focus();
}

function openDrawer(shell: HTMLElement): void {
  closeAllSurfaces();
  const drawer = shell.querySelector<HTMLElement>('.er-row-drawer');
  const fg = shell.querySelector<HTMLElement>('.er-row-fg');
  if (!drawer || !fg) return;
  // Translate distance = sum of action chip widths. Each chip is 64px
  // wide; count rendered chips for the per-stage drawer size.
  const chipCount = drawer.querySelectorAll('.er-row-action').length;
  const px = chipCount * 64;
  fg.style.transform = `translateX(-${px}px)`;
  shell.classList.add('is-swiped');
  drawer.setAttribute('aria-hidden', 'false');
  openSurfaces.add(shell);
}

function wireOverflowButton(shell: HTMLElement): void {
  const overflow = shell.querySelector<HTMLButtonElement>('[data-row-overflow]');
  if (!overflow) return;
  overflow.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shell.classList.contains('is-menu-open')) {
      closeSurface(shell);
    } else {
      openMenu(shell);
    }
  });
}

function wireMenuItems(shell: HTMLElement): void {
  const menu = shell.querySelector<HTMLElement>('.er-row-menu');
  if (!menu) return;
  const items = Array.from(menu.querySelectorAll<HTMLElement>('.er-row-menu-item'));
  for (const item of items) {
    item.addEventListener('click', async () => {
      const copy = item.dataset.copy;
      const href = item.dataset.href;
      if (copy) {
        const ok = await copyOrShowFallback(copy, {
          successMessage: `Copied ${copy}`,
          fallbackMessage:
            'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:',
        });
        if (ok) {
          item.classList.add('is-copied');
          window.setTimeout(() => item.classList.remove('is-copied'), COPIED_FLASH_MS);
        }
      } else if (href) {
        window.location.href = href;
      }
      closeSurface(shell);
    });
  }
  // Arrow-key navigation inside the open menu.
  menu.addEventListener('keydown', (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSurface(shell);
      const overflow = shell.querySelector<HTMLButtonElement>('[data-row-overflow]');
      overflow?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const focused = document.activeElement;
    const idx = items.findIndex((i) => i === focused);
    if (idx < 0) return;
    const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
    if (next >= 0 && next < items.length) items[next].focus();
  });
}

function wireDrawerActions(shell: HTMLElement): void {
  const drawer = shell.querySelector<HTMLElement>('.er-row-drawer');
  if (!drawer) return;
  const actions = drawer.querySelectorAll<HTMLElement>('.er-row-action');
  for (const action of actions) {
    action.addEventListener('click', async (e) => {
      e.stopPropagation();
      const copy = action.dataset.copy;
      const href = action.dataset.href;
      if (copy) {
        const ok = await copyOrShowFallback(copy, {
          successMessage: `Copied ${copy}`,
          fallbackMessage:
            'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:',
        });
        if (ok) {
          action.classList.add('is-copied');
          window.setTimeout(
            () => action.classList.remove('is-copied'),
            COPIED_FLASH_MS,
          );
        }
      } else if (href) {
        window.location.href = href;
      }
      closeSurface(shell);
    });
  }
}

function wireSwipe(shell: HTMLElement): void {
  const fg = shell.querySelector<HTMLElement>('.er-row-fg');
  if (!fg) return;

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let axisLocked: 'h' | 'v' | null = null;

  fg.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (!isMobile()) return;
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      dragging = true;
      axisLocked = null;
      fg.style.transition = 'none';
    },
    { passive: true },
  );

  fg.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (!dragging || !isMobile()) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Lock axis on first non-trivial movement so vertical scrolls
      // through the dashboard don't trigger row swipes.
      if (axisLocked === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axisLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (axisLocked !== 'h') return;
      // Only allow leftward swipe (positive translate becomes negative).
      const tx = Math.min(0, dx);
      fg.style.transform = `translateX(${tx}px)`;
    },
    { passive: true },
  );

  fg.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      if (!dragging || !isMobile()) return;
      dragging = false;
      fg.style.transition = '';
      if (axisLocked !== 'h') {
        // Vertical scroll or no movement — reset.
        fg.style.transform = '';
        return;
      }
      const t = e.changedTouches[0];
      const dx = t ? t.clientX - startX : 0;
      if (dx < -SWIPE_THRESHOLD_PX) {
        openDrawer(shell);
      } else {
        // Below threshold — snap back.
        fg.style.transform = '';
        shell.classList.remove('is-swiped');
        openSurfaces.delete(shell);
      }
      axisLocked = null;
    },
    { passive: true },
  );
}

/**
 * Click anywhere outside an open row-shell closes that row's open
 * surfaces. Bound once at document level, regardless of how many rows
 * render.
 */
function wireGlobalDismiss(): void {
  document.addEventListener('click', (e) => {
    if (openSurfaces.size === 0) return;
    const target = e.target;
    if (!(target instanceof Element)) {
      closeAllSurfaces();
      return;
    }
    const shell = target.closest<HTMLElement>('[data-row-shell]');
    if (!shell || !openSurfaces.has(shell)) {
      closeAllSurfaces();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key === 'Escape' && openSurfaces.size > 0) closeAllSurfaces();
  });
}

export function initRowActions(): void {
  const shells = document.querySelectorAll<HTMLElement>('[data-row-shell]');
  if (shells.length === 0) return;
  for (const shell of shells) {
    wireOverflowButton(shell);
    wireMenuItems(shell);
    wireDrawerActions(shell);
    wireSwipe(shell);
  }
  wireGlobalDismiss();
}
