/**
 * Mobile lane-visibility sheet controller — Phase 5 Task 5.3.3.
 *
 * At phone widths the lane-visibility rail is repositioned by CSS into
 * a slide-up bottom sheet. This controller wires the bay-head's
 * `[data-lane-sheet-trigger]` button ("Lanes ▾") to open/close the
 * `[data-lane-sheet]` container. Dismiss paths:
 *
 *   - Trigger click (toggles open <-> closed).
 *   - Backdrop tap (`[data-lane-sheet-backdrop]`).
 *   - Escape key.
 *   - Activating a rail row (clicking or keyboard-activating a
 *     `[data-rail-lane]` inside the sheet) — the focus/visibility
 *     change is the operator's intent; the sheet closes so they see
 *     the bay update without manual dismissal.
 *
 * Per `.claude/rules/affordance-placement.md`, the trigger lives ON
 * the bay-head (the bay's local chrome) — lanes are a bay concern,
 * not a page-level concern.
 *
 * Per THESIS Consequence 2, no sidecar mutation: this is pure
 * client-side state on top of the rail the existing
 * `bindRailEyeToggles` controller already manages.
 *
 * Mirrors the existing slide-up sheet patterns at
 * `entry-review/mobile-sheet-bar.ts` and `dashboard/compose-chip.ts`
 * via the shared `createSlideUpSheet` controller. New idioms are
 * limited to (a) the trigger's `aria-expanded` mirroring, (b) the
 * focus-return-to-trigger contract on close, and (c) the opt-in
 * `trapFocus: true` flag on the shared controller — the scrim-backed
 * lane sheet is a modal-shaped surface, so Tab/Shift+Tab must contain
 * focus within the sheet (WCAG 2.4.3 Focus Order). Audit-coverage:
 * AUDIT-20260530-38 / AUDIT-20260530-41.
 */

import { createSlideUpSheet } from '../mobile-shell/sheet-controller.ts';

/**
 * Bind the mobile lane-visibility sheet. No-op when the trigger or
 * sheet container is absent (e.g., on routes that don't render the
 * bay shell). Returns early without throwing.
 */
export function initSwimlaneMobileSheet(): void {
  const trigger = document.querySelector<HTMLButtonElement>(
    '[data-lane-sheet-trigger]',
  );
  const sheet = document.querySelector<HTMLElement>('[data-lane-sheet]');
  if (trigger === null || sheet === null) return;

  const backdrop = sheet.querySelector<HTMLElement>(
    '[data-lane-sheet-backdrop]',
  );

  // The shared controller flips `data-lane-sheet-open` on document.
  // body; the CSS rules in dashboard-swimlane-mobile.css translate
  // that into a slide-up reveal on the `[data-lane-sheet]` container.
  // Local state mirrors `aria-expanded` on the trigger.
  const sheetController = createSlideUpSheet({
    sheetEl: sheet,
    bodyOpenAttr: 'data-lane-sheet-open',
    scrimEl: backdrop ?? undefined,
    // The scrim-backed lane sheet is a modal-shaped surface; Tab and
    // Shift+Tab must wrap inside the sheet so keyboard focus doesn't
    // walk into the page behind the scrim. AUDIT-20260530-38 /
    // AUDIT-20260530-41 regression coverage in
    // packages/studio/test/dashboard-swimlane-mobile-sheet-client.test.ts.
    trapFocus: true,
    onClose: () => {
      sheet.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      // Return focus to the trigger so a sighted operator's pointer
      // and an AT user's reading focus both land on the affordance
      // that opened the sheet (per the standard disclosure-widget
      // contract).
      trigger.focus();
    },
  });

  function openSheet(): void {
    sheet!.classList.add('is-open');
    trigger!.setAttribute('aria-expanded', 'true');
    sheetController.open();
    focusFirstSheetTarget();
  }

  function closeSheet(): void {
    sheetController.close();
  }

  function focusFirstSheetTarget(): void {
    // Prefer the first rail row's eye-button (the row's primary
    // affordance); fall back to the first rail row (a real
    // role="button" focusable). Either focus lands the operator
    // inside the sheet content.
    const firstEye = sheet!.querySelector<HTMLElement>(
      '[data-rail-lane] .r-eye-btn',
    );
    if (firstEye !== null) {
      firstEye.focus();
      return;
    }
    const firstRow = sheet!.querySelector<HTMLElement>('[data-rail-lane]');
    if (firstRow !== null) firstRow.focus();
  }

  trigger.addEventListener('click', () => {
    if (sheetController.isOpen()) {
      closeSheet();
    } else {
      openSheet();
    }
  });

  // Closing on rail-row activation: the swimlane controller's row
  // handler runs first (mutating focus/visibility state); this
  // sibling handler closes the sheet so the operator sees the bay
  // update. Listening at the sheet root (capture=false) honors the
  // gesture's natural bubbling order — both handlers fire from the
  // same click without coordination.
  //
  // Eye-button activations are explicitly a "hide/show without
  // dismissing the sheet" gesture — operators flipping visibility
  // through the rail expect to see the result inside the sheet
  // before closing it. Both click and keyboard paths defer to the
  // same predicate so the close contract is identical across input
  // modalities.
  function shouldCloseOnTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target.closest('.r-eye-btn') !== null) return false;
    if (target.closest('[data-rail-lane]') === null) return false;
    return sheetController.isOpen();
  }

  sheet.addEventListener('click', (ev) => {
    if (shouldCloseOnTarget(ev.target)) closeSheet();
  });

  sheet.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (shouldCloseOnTarget(ev.target)) closeSheet();
  });
}
