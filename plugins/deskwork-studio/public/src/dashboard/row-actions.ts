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
// Commit threshold: how far the user must drag horizontally before
// the foreground begins to translate (revealing the drawer). Below
// this, taps with natural finger drift don't visually move the row.
const SWIPE_COMMIT_PX = 24;
// Latch threshold: how far past commit the user must drag for the
// drawer to latch open on touchend. Below this, the row snaps back.
const SWIPE_LATCH_PX = 60;
// Axis-lock threshold: minimum total movement (in either axis) before
// the gesture commits to horizontal or vertical. Raised from 8 so
// natural finger jitter during a tap doesn't lock to horizontal.
const AXIS_LOCK_PX = 16;
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

/**
 * Row-body click → navigate to the entry-review surface. Per the
 * Row-4 design brief, tap-anywhere-on-the-row IS the primary action
 * (the slug link is the visible affordance, but the entire row body
 * should respond — operators won't precisely target the slug text
 * on phone).
 *
 * Skips clicks on: buttons (handled by their own controllers), links
 * (browser handles native navigation), elements inside the drawer or
 * menu (handled by their respective wirers), and the ⋮ button.
 */
function wireRowBodyClick(shell: HTMLElement): void {
  const fg = shell.querySelector<HTMLElement>('.er-row-fg');
  const uuid = shell.dataset.uuid;
  if (!fg || !uuid) return;
  fg.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    // Let buttons + links own their own clicks.
    if (target.closest('button, a, [data-row-overflow]')) return;
    // Don't navigate if any drawer or menu is open on this shell.
    if (shell.classList.contains('is-menu-open') || shell.classList.contains('is-swiped')) return;
    window.location.href = `/dev/editorial-review/entry/${uuid}`;
  });
  // Make it clear the row is clickable.
  fg.style.cursor = 'pointer';
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
  let translating = false;

  function reset(): void {
    dragging = false;
    axisLocked = null;
    translating = false;
    fg!.style.transition = '';
    fg!.style.transform = '';
  }

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
      translating = false;
      // Don't set transition: 'none' until we're actually translating —
      // otherwise a tap leaves transition disabled until the next move.
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
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        axisLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (axisLocked !== 'h') return;
      // Only translate once dx exceeds the commit threshold. Below
      // commit, even a clear horizontal jitter doesn't reveal the
      // drawer — a tap with natural finger drift shows zero visual
      // movement.
      if (dx > -SWIPE_COMMIT_PX) {
        if (translating) {
          // We had committed; user is dragging back below threshold.
          fg.style.transform = '';
        }
        return;
      }
      if (!translating) {
        translating = true;
        fg.style.transition = 'none';
      }
      // Subtract the commit threshold so the visible motion begins at 0
      // when the user crosses the commit line, not at -24.
      const tx = dx + SWIPE_COMMIT_PX;
      fg.style.transform = `translateX(${tx}px)`;
    },
    { passive: true },
  );

  function onEnd(e: TouchEvent): void {
    if (!dragging || !isMobile()) return;
    const wasTranslating = translating;
    dragging = false;
    fg!.style.transition = '';
    if (!wasTranslating) {
      // No visible translate happened — this was a tap (with possibly
      // some jitter) or a vertical scroll. Nothing to snap back.
      axisLocked = null;
      translating = false;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t ? t.clientX - startX : 0;
    if (dx < -SWIPE_LATCH_PX) {
      openDrawer(shell);
    } else {
      fg!.style.transform = '';
      shell.classList.remove('is-swiped');
      openSurfaces.delete(shell);
    }
    axisLocked = null;
    translating = false;
  }

  fg.addEventListener('touchend', onEnd, { passive: true });
  // touchcancel fires when iOS / Android decides to take over the
  // touch (scroll, system gesture, etc.). Reset state so a follow-up
  // touch doesn't pick up stale `dragging=true`.
  fg.addEventListener(
    'touchcancel',
    () => {
      reset();
      shell.classList.remove('is-swiped');
      openSurfaces.delete(shell);
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
    wireRowBodyClick(shell);
  }
  wireGlobalDismiss();
}
