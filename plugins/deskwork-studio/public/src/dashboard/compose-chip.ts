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
import { createSlideUpSheet, type SlideUpSheetController } from '../mobile-shell/sheet-controller.ts';

const MOBILE_QUERY = '(max-width: 600px)';
const SLIDE_MS = 280;
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

  // Called by the shared controller on every close path (drag, close btn,
  // scrim click, Escape, programmatic close). Restores FAB aria state and
  // delays the hidden attribute so the slide-out transition completes before
  // click-through is restored.
  function onSheetClose(): void {
    fab!.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!sheetController.isOpen()) sheet!.hidden = true;
    }, SLIDE_MS + 40);
  }

  // The shared controller owns: drag-handle gesture, close button, scrim
  // click, Escape key, and the body[data-compose-sheet-open] attribute
  // toggle. Constants use controller defaults (80px dismiss, 280ms slide)
  // which match the values formerly inlined in this file.
  const sheetController: SlideUpSheetController = createSlideUpSheet({
    sheetEl: sheet,
    bodyOpenAttr: 'data-compose-sheet-open',
    handleEl: handle ?? undefined,
    closeBtnEl: closeBtn ?? undefined,
    scrimEl: scrim ?? undefined,
    onClose: onSheetClose,
  });

  function openSheet(): void {
    if (!isMobile()) return;
    if (sheetController.isOpen()) {
      sheetController.close();
      return;
    }
    sheet!.hidden = false;
    fab!.setAttribute('aria-expanded', 'true');
    sheetController.open();
  }

  fab.addEventListener('click', openSheet);

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
