/**
 * Parameterized slide-up sheet controller.
 *
 * Extracted from the near-identical gesture implementations in:
 *   - entry-review/mobile-sheet-bar.ts (lines 349-371)
 *   - dashboard/compose-chip.ts (lines 80-116)
 *
 * Both consumers share:
 *   - SLIDE_MS = 280 (slide animation duration)
 *   - DRAG_DISMISS_PX = 80 (drag threshold for dismiss)
 *   - Same touchstart/touchmove/touchend + mousedown/mousemove/mouseup
 *     gesture sequence on the drag handle
 *   - Same body data-attribute toggle pattern
 *   - Same document-level Escape key handler
 *   - Same close-button and scrim-click dismiss behavior
 *
 * Consumers are migrated in Steps 2.1.6 and 2.1.7.
 */

/** Default drag-to-dismiss threshold in pixels (matches both consumers). */
const DEFAULT_DRAG_DISMISS_PX = 80;

/**
 * Selector for keyboard-focusable elements inside a container. Used by
 * the opt-in focus trap. Mirrors the canonical "focusable element"
 * shortlist (links/buttons/inputs/tabindex>=0) and excludes elements
 * explicitly removed from the tab order via `tabindex="-1"` or
 * `disabled`. Not exhaustive (no contenteditable, no audio/video
 * controls) — the lane-sheet and current sibling sheets render only
 * buttons + role-button rows, so this matches the deployed surface
 * without overreach.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Collect focusable elements inside `root` in DOM order, excluding any
 * with explicit `tabindex="-1"` or `disabled`. Returns an empty array
 * when nothing matches.
 */
function collectFocusables(root: HTMLElement): readonly HTMLElement[] {
  const matches = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(matches);
}

export interface SlideUpSheetOptions {
  /**
   * The sheet host element. Container, not the inner panel.
   * Used for transform-during-drag only — the body attribute controls
   * CSS-level open/close visibility.
   */
  sheetEl: HTMLElement;
  /**
   * Body data-attribute name to toggle on open/close.
   * Use the full attribute name including the 'data-' prefix
   * (e.g. 'data-mobile-sheet-open', 'data-compose-sheet-open').
   */
  bodyOpenAttr: string;
  /**
   * Optional drag handle. If present, touch and mouse drag downward
   * past dragDismissPx closes the sheet.
   *
   * **CSS REQUIREMENT (#268):** the handle element MUST have
   * `touch-action: none` in CSS. Without it, the browser's native
   * touch-scroll behavior wins over the controller's touchmove
   * handler (the handler is registered passive and cannot
   * preventDefault), the page behind the sheet scrolls instead of
   * the gesture being routed to drag-to-dismiss, and the sheet never
   * closes via drag. Working precedents:
   *   - `dashboard-mobile.css .er-compose-handle` (Compose FAB)
   *   - `editorial-review.css .er-mobile-sheet-handle` (entry-review +
   *     shortform sheets)
   * Add the rule to any new consumer's handle CSS before consuming
   * this controller; failure to do so produces a silent UX
   * regression on touch devices (the handle looks right, the
   * controller fires, but the gesture is consumed by the page).
   */
  handleEl?: HTMLElement;
  /**
   * Optional close button. Click closes the sheet.
   */
  closeBtnEl?: HTMLElement;
  /**
   * Optional scrim element. Click closes the sheet.
   */
  scrimEl?: HTMLElement;
  /**
   * Drag distance in pixels past which release dismisses the sheet.
   * Default: 80.
   */
  dragDismissPx?: number;
  /**
   * Called when the sheet closes (any path: handle drag, close btn,
   * scrim click, Escape key, programmatic close).
   * NOT called when close() is called while already closed.
   */
  onClose?: () => void;
  /**
   * When `true`, install an opt-in focus trap that contains Tab /
   * Shift+Tab traversal within `sheetEl` while the sheet is open.
   *
   * Contract:
   *   - Tab from the LAST focusable inside `sheetEl` wraps focus to
   *     the FIRST focusable inside `sheetEl` (preventDefault).
   *   - Shift+Tab from the FIRST focusable wraps to the LAST
   *     (preventDefault).
   *   - Tab mid-list is not interfered with (browser's natural
   *     traversal applies; the trap only fires at the edges).
   *   - The trap is gated on `isOpen()` — does nothing while closed.
   *
   * Why opt-in: existing consumers (compose-chip,
   * entry-review/mobile-sheet-bar) shipped without an explicit trap
   * and have their own a11y contracts. Opting in keeps them
   * back-compat while letting the lane-visibility sheet (and any
   * future modal-shaped consumer) honor the WCAG 2.4.3 (Focus Order)
   * expectation that a scrim-backed sheet contains keyboard focus.
   *
   * Default: `false`.
   */
  trapFocus?: boolean;
}

export interface SlideUpSheetController {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createSlideUpSheet(opts: SlideUpSheetOptions): SlideUpSheetController {
  const {
    sheetEl,
    bodyOpenAttr,
    handleEl,
    closeBtnEl,
    scrimEl,
    onClose,
  } = opts;
  const dragDismissPx = opts.dragDismissPx ?? DEFAULT_DRAG_DISMISS_PX;

  let open = false;

  function doOpen(): void {
    open = true;
    document.body.setAttribute(bodyOpenAttr, '');
  }

  function doClose(): void {
    if (!open) return;
    open = false;
    document.body.removeAttribute(bodyOpenAttr);
    onClose?.();
  }

  // ---- Close button --------------------------------------------------------

  if (closeBtnEl) {
    closeBtnEl.addEventListener('click', doClose);
  }

  // ---- Scrim ---------------------------------------------------------------

  if (scrimEl) {
    scrimEl.addEventListener('click', doClose);
  }

  // ---- Escape key ----------------------------------------------------------

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) doClose();
  });

  // ---- Focus trap (opt-in) -------------------------------------------------
  //
  // Tab / Shift+Tab containment for scrim-backed modal sheets. Wired on
  // `sheetEl` (capture=false) so a consumer's own keydown handlers fire
  // first; the trap's only job is the edge-wrap at first/last focusable.
  // No-op when `opts.trapFocus` is false (default) or while closed.

  if (opts.trapFocus === true) {
    sheetEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key !== 'Tab') return;
      const focusables = collectFocusables(sheetEl);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) return;
      const activeEl = document.activeElement;
      const onFirst = activeEl === first;
      const onLast = activeEl === last;
      if (e.shiftKey && onFirst) {
        e.preventDefault();
        last.focus();
        return;
      }
      if (!e.shiftKey && onLast) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // ---- Drag-to-dismiss via the handle (touch + mouse) ---------------------

  if (handleEl) {
    let startY = 0;
    let dragging = false;

    function onStart(y: number): void {
      startY = y;
      dragging = true;
      sheetEl.style.transition = 'none';
    }

    function onMove(y: number): void {
      if (!dragging) return;
      const dy = Math.max(0, y - startY);
      sheetEl.style.transform = `translateY(${dy}px)`;
    }

    function onEnd(y: number): void {
      if (!dragging) return;
      dragging = false;
      sheetEl.style.transition = '';
      const dy = Math.max(0, y - startY);
      sheetEl.style.transform = '';
      if (dy > dragDismissPx) doClose();
    }

    // Touch events (mobile)
    handleEl.addEventListener(
      'touchstart',
      (e: TouchEvent) => onStart(e.touches[0]?.clientY ?? 0),
      { passive: true },
    );
    handleEl.addEventListener(
      'touchmove',
      (e: TouchEvent) => onMove(e.touches[0]?.clientY ?? 0),
      { passive: true },
    );
    handleEl.addEventListener('touchend', (e: TouchEvent) =>
      onEnd(e.changedTouches[0]?.clientY ?? 0),
    );

    // Mouse events (desktop / testing)
    handleEl.addEventListener('mousedown', (e: MouseEvent) => onStart(e.clientY));
    document.addEventListener('mousemove', (e: MouseEvent) => onMove(e.clientY));
    document.addEventListener('mouseup', (e: MouseEvent) => onEnd(e.clientY));
  }

  // ---- Public API ----------------------------------------------------------

  return {
    open: doOpen,
    close: doClose,
    isOpen: () => open,
  };
}
