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
