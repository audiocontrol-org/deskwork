/**
 * Mobile floating-Compose-chip + sheet controller for the dashboard.
 *
 * Wires the floating "+ Compose" chip at bottom-right and the slide-up
 * sheet listing creation verbs. Visible only at <= 600px (phone) via
 * a CSS media query in dashboard-mobile.css. Desktop reaches creation
 * verbs through the existing intake form in the Ideas section header,
 * which is suppressed on phone.
 *
 * Each verb in the sheet copies its `/deskwork:<verb>` slash command
 * to the clipboard via copyOrShowFallback (THESIS Consequence 2 — the
 * agent does the work; the studio routes intent). The sheet does not
 * auto-close after a copy: the operator may want multiple verbs in
 * sequence, and explicit dismissal matches the entry-review sheet's
 * behavior.
 *
 * Visual reference: /static/mockups/dashboard-1c-filing-tab-fab.html
 */

import { copyOrShowFallback } from '../clipboard.ts';

const MOBILE_QUERY = '(max-width: 600px)';
const SLIDE_MS = 280;
const DRAG_DISMISS_PX = 80;
const COPIED_FLASH_MS = 1500;

export function initComposeChip(): void {
  const fab = document.querySelector<HTMLButtonElement>('[data-compose-fab]');
  const sheet = document.querySelector<HTMLElement>('[data-compose-sheet]');
  if (!fab || !sheet) return;

  const handle = sheet.querySelector<HTMLElement>('[data-compose-handle]');
  const closeBtn = sheet.querySelector<HTMLButtonElement>('[data-compose-close]');
  const scrim = sheet.querySelector<HTMLElement>('[data-compose-scrim]');
  const verbs = Array.from(
    sheet.querySelectorAll<HTMLButtonElement>('[data-compose-verb]'),
  );

  function isMobile(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  let isOpen = false;

  function openSheet(): void {
    if (!isMobile()) return;
    if (isOpen) {
      closeSheet();
      return;
    }
    isOpen = true;
    sheet!.hidden = false;
    document.body.setAttribute('data-compose-sheet-open', '');
    fab!.setAttribute('aria-expanded', 'true');
  }

  function closeSheet(): void {
    if (!isOpen) return;
    isOpen = false;
    document.body.removeAttribute('data-compose-sheet-open');
    fab!.setAttribute('aria-expanded', 'false');
    // Hide the sheet host after the slide-out completes so click-through
    // works during the transition.
    window.setTimeout(() => {
      if (!isOpen) sheet!.hidden = true;
    }, SLIDE_MS + 40);
  }

  fab.addEventListener('click', openSheet);
  closeBtn?.addEventListener('click', closeSheet);
  scrim?.addEventListener('click', closeSheet);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeSheet();
  });

  // Drag-to-dismiss the panel via the handle. Mirrors the pattern in
  // entry-review/mobile-sheet-bar.ts so the gesture muscle memory
  // transfers between the two surfaces.
  if (handle) {
    let startY = 0;
    let dragging = false;
    function onStart(y: number): void {
      startY = y;
      dragging = true;
      sheet!.style.transition = 'none';
    }
    function onMove(y: number): void {
      if (!dragging) return;
      const dy = Math.max(0, y - startY);
      sheet!.style.transform = `translateY(${dy}px)`;
    }
    function onEnd(y: number): void {
      if (!dragging) return;
      dragging = false;
      sheet!.style.transition = '';
      const dy = Math.max(0, y - startY);
      sheet!.style.transform = '';
      if (dy > DRAG_DISMISS_PX) closeSheet();
    }
    handle.addEventListener(
      'touchstart',
      (e) => onStart(e.touches[0]?.clientY ?? 0),
      { passive: true },
    );
    handle.addEventListener(
      'touchmove',
      (e) => onMove(e.touches[0]?.clientY ?? 0),
      { passive: true },
    );
    handle.addEventListener('touchend', (e) =>
      onEnd(e.changedTouches[0]?.clientY ?? 0),
    );
    handle.addEventListener('mousedown', (e) => onStart(e.clientY));
    document.addEventListener('mousemove', (e) => onMove(e.clientY));
    document.addEventListener('mouseup', (e) => onEnd(e.clientY));
  }

  // Verb cards copy their slash command. The buttons carry `data-copy`
  // (the slash command source) and `data-compose-verb` (the selector
  // marker — we deliberately do NOT use `.er-copy-btn` here so the
  // existing initCopyButtons handler doesn't double-bind and clobber
  // the rich button content with a "copied ✓" textContent swap).
  for (const verb of verbs) {
    verb.addEventListener('click', async () => {
      const cmd = verb.dataset.copy;
      if (!cmd) return;
      const ok = await copyOrShowFallback(cmd, {
        successMessage: `Copied ${cmd}`,
        fallbackMessage:
          'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:',
      });
      if (ok) {
        verb.classList.add('is-copied');
        window.setTimeout(
          () => verb.classList.remove('is-copied'),
          COPIED_FLASH_MS,
        );
      }
    });
  }
}
