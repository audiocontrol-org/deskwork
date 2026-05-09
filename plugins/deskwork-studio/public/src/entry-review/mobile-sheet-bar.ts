/**
 * Mobile bottom-bar + sheet controller for the entry-keyed review surface.
 *
 * Wires the 3-tab bottom bar (Outline · Notes · Actions) and the sheet
 * host that slides up over the article. Active only at <48rem viewport
 * widths — the matchMedia gate suppresses all wiring on desktop so the
 * existing layout is untouched.
 *
 * Responsibilities:
 *   - Populate sheet slots at boot from the desktop renderers (clone the
 *     outline body and the marginalia list; render fresh action buttons).
 *   - Keep the Notes count badge in sync with the live annotation count
 *     via a MutationObserver on the source `[data-sidebar-list]`.
 *   - Tab clicks open the sheet to the matching slot; the same tab tap
 *     while open closes the sheet.
 *   - Drag the handle (or swipe the head) to dismiss; tap the close
 *     button or anywhere outside the sheet body to dismiss.
 *   - Bidirectional mark↔note linking:
 *       · Tap a `<mark data-annotation-id>` in the article → open Notes
 *         sheet, scroll the matching `[data-annotation-id]` item into
 *         view, briefly flash it.
 *       · Tap a `[data-annotation-id]` item in the Notes sheet → close
 *         sheet, scroll the matching `<mark>` into view, briefly flash
 *         it.
 *   - Actions sheet clipboard-copy: every decision button copies the
 *     corresponding `/deskwork:<verb> <slug>` skill command (THESIS
 *     Consequence 2). No state-machine endpoints.
 *
 * Visual reference: /static/mockups/mobile-1-bottom-sheet.html
 */

import { bindFormatKeys } from './format-keys.ts';
import { populateActionsSlot } from './mobile-actions-slot.ts';

const MOBILE_QUERY = '(max-width: 48rem)';
const FLASH_MS = 1100;
const SLIDE_MS = 280;

export type SheetKey = 'outline' | 'notes' | 'actions' | 'format' | 'scrapbook';

const SHEET_KEYS: ReadonlyArray<SheetKey> = ['outline', 'notes', 'actions', 'format', 'scrapbook'];

function isSheetKey(value: string | undefined): value is SheetKey {
  if (value === undefined) return false;
  return SHEET_KEYS.some((k) => k === value);
}

interface SheetBarDeps {
  readonly entrySlug: string;
}

export interface MobileSheetBarController {
  /** Open any sheet programmatically. No-op on desktop (bar/sheet are
   *  display:none above 48rem). Used by the annotations controller's
   *  `unstowMarginalia` hook so the composer (relocated into the Notes
   *  slot at boot) becomes visible when the operator hits Mark. */
  openSheet: (key: SheetKey) => void;
  /** True on phone widths. Callers gate behavior off this. */
  isMobile: () => boolean;
}

export function initMobileSheetBar(deps: SheetBarDeps): MobileSheetBarController {
  const noop: MobileSheetBarController = {
    openSheet: () => {},
    isMobile: () => window.matchMedia(MOBILE_QUERY).matches,
  };
  const bar = document.querySelector<HTMLElement>('[data-mobile-bar]');
  const sheet = document.querySelector<HTMLElement>('[data-mobile-sheet-host]');
  if (!bar || !sheet) return noop;

  // ---- Bind once at boot. The CSS gate handles desktop suppression of
  //      the bar/sheet visibility; this controller wires interactions
  //      regardless so the bar/sheet are reactive when the viewport
  //      crosses the breakpoint. The actual sheet content only populates
  //      at first open (or at boot for live-bound slots). ----

  const tabs = Array.from(bar.querySelectorAll<HTMLButtonElement>('[data-mobile-sheet]'));
  const slots = {
    outline: sheet.querySelector<HTMLElement>('[data-mobile-sheet-slot="outline"]'),
    notes: sheet.querySelector<HTMLElement>('[data-mobile-sheet-slot="notes"]'),
    actions: sheet.querySelector<HTMLElement>('[data-mobile-sheet-slot="actions"]'),
    format: sheet.querySelector<HTMLElement>('[data-mobile-sheet-slot="format"]'),
    scrapbook: sheet.querySelector<HTMLElement>('[data-mobile-sheet-slot="scrapbook"]'),
  };
  const kicker = sheet.querySelector<HTMLElement>('[data-mobile-sheet-kicker]');
  const meta = sheet.querySelector<HTMLElement>('[data-mobile-sheet-meta]');
  const handle = sheet.querySelector<HTMLElement>('[data-mobile-sheet-handle]');
  const closeBtn = sheet.querySelector<HTMLButtonElement>('[data-mobile-sheet-close]');
  const notesCount = bar.querySelector<HTMLElement>('[data-notes-count]');
  const scrapbookCount = bar.querySelector<HTMLElement>('[data-scrapbook-count]');

  if (!slots.outline || !slots.notes || !slots.actions || !slots.format || !slots.scrapbook || !kicker || !meta) return noop;

  // The notes slot is structured (on mobile) as:
  //   [composer, sidebar-empty, sidebar-list]
  // All three elements are MOVED (not cloned) from `.er-marginalia` into
  // the slot at boot. Moving means:
  //   - The annotations controller's render target ([data-sidebar-list])
  //     keeps working — every render attaches event listeners to fresh
  //     <li> children, so Edit / Resolve / Delete / scroll-to-mark
  //     handlers all fire correctly inside the sheet.
  //   - The composer's annotations-controller wiring works too (the
  //     controller holds a reference to the element; element.parentNode
  //     changes, but the reference is stable).
  //
  // Gated on matchMedia('(max-width: 48rem)'). On desktop everything
  // stays in `.er-marginalia` where the annotations controller's inline
  // absolute positioning (relative to the marginalia column's
  // offsetParent) keeps working. Moving these into a display:none sheet
  // on desktop would break the absolute positioning.
  if (slots.notes && window.matchMedia(MOBILE_QUERY).matches) {
    const composer = document.querySelector<HTMLElement>('[data-comment-composer]');
    const empty = document.querySelector<HTMLElement>('[data-sidebar-empty]');
    const list = document.querySelector<HTMLElement>('[data-sidebar-list]');
    if (composer) slots.notes.appendChild(composer);
    if (empty) slots.notes.appendChild(empty);
    if (list) slots.notes.appendChild(list);
  }

  // The CSS toggles visibility with `body[data-mobile-sheet-open]` plus
  // `data-mobile-sheet-slot` on the host; the controller flips both.
  let currentSheet: SheetKey | null = null;

  function openSheet(key: SheetKey): void {
    if (currentSheet === key) {
      closeSheet();
      return;
    }
    populateSlot(key);
    currentSheet = key;
    sheet!.hidden = false;
    sheet!.setAttribute('data-mobile-sheet-slot', key);
    for (const slotKey of SHEET_KEYS) {
      const slot = slots[slotKey];
      if (slot) slot.hidden = slotKey !== key;
    }
    setSheetHeader(key);
    document.body.setAttribute('data-mobile-sheet-open', '');
    for (const t of tabs) {
      t.setAttribute('aria-expanded', t.dataset.mobileSheet === key ? 'true' : 'false');
    }
  }

  function closeSheet(): void {
    if (currentSheet === null) return;
    currentSheet = null;
    document.body.removeAttribute('data-mobile-sheet-open');
    for (const t of tabs) t.setAttribute('aria-expanded', 'false');
    // Hide the sheet host after the slide-out completes so click-through
    // works during the transition.
    window.setTimeout(() => {
      if (currentSheet === null) sheet!.hidden = true;
    }, SLIDE_MS + 40);
  }

  function setSheetHeader(key: SheetKey): void {
    if (key === 'outline') {
      kicker!.textContent = '§ Outline';
      meta!.textContent = sectionCountLabel();
    } else if (key === 'notes') {
      kicker!.textContent = 'Margin notes';
      meta!.textContent = noteCountLabel();
    } else if (key === 'format') {
      kicker!.textContent = 'Format · markdown';
      meta!.textContent = 'Tap to insert';
    } else if (key === 'scrapbook') {
      kicker!.textContent = '▦ Scrapbook · Folio';
      meta!.textContent = scrapbookCountLabel();
    } else {
      kicker!.textContent = '⊕ Actions';
      meta!.textContent = '';
    }
  }

  // ---- Slot population --------------------------------------------------

  const populatedSlots: Set<SheetKey> = new Set();

  function populateSlot(key: SheetKey): void {
    if (populatedSlots.has(key)) {
      // Notes need a refresh on each open so the operator sees the
      // current annotations even after editing on another surface.
      if (key === 'notes') refreshNotesSlot();
      if (key === 'outline') refreshOutlineSlot();
      return;
    }
    if (key === 'outline') refreshOutlineSlot();
    else if (key === 'notes') refreshNotesSlot();
    else if (key === 'actions') populateActionsSlot(slots.actions!, { entrySlug: deps.entrySlug }, closeSheet);
    else if (key === 'format') populateFormatSlot();
    else if (key === 'scrapbook') refreshScrapbookSlot();
    populatedSlots.add(key);
  }

  // The scrapbook desktop drawer (`.er-scrapbook-drawer-body`) is the
  // server-rendered source of truth — it lists the entry's per-node
  // scrapbook items with thumbnails, file names, sizes, etc. On phone
  // the drawer itself is `display: none` (it lived at bottom: 0 z-index
  // 55, which the mobile bar at z-index 60 obscured). We clone its
  // children into the slot at first open + on every subsequent open
  // so adds/deletes via the desktop UI surface in the mobile sheet too.
  function refreshScrapbookSlot(): void {
    if (!slots.scrapbook) return;
    const source = document.querySelector<HTMLElement>('.er-scrapbook-drawer-body');
    slots.scrapbook.innerHTML = '';
    if (!source) {
      slots.scrapbook.textContent = 'No scrapbook items for this entry.';
      return;
    }
    for (const child of Array.from(source.children)) {
      const cloned = child.cloneNode(true);
      if (cloned instanceof HTMLElement) slots.scrapbook.appendChild(cloned);
    }
  }

  // The format slot's grid is rendered server-side (mobile-bar.ts).
  // First-open binds delegated click handling on each `[data-fkey]`
  // button and closes the sheet after a successful insertion so the
  // operator sees the editor update without dismissing manually.
  function populateFormatSlot(): void {
    if (!slots.format) return;
    bindFormatKeys(slots.format, () => closeSheet());
  }

  function refreshOutlineSlot(): void {
    if (!slots.outline) return;
    const source = document.querySelector<HTMLElement>('.er-outline-drawer-body');
    slots.outline.innerHTML = '';
    if (!source) {
      slots.outline.textContent = 'No outline available for this entry.';
      return;
    }
    // Clone children (deep) so the desktop drawer's TOC stays intact.
    for (const child of Array.from(source.children)) {
      const cloned = child.cloneNode(true);
      if (cloned instanceof HTMLElement) slots.outline.appendChild(cloned);
    }
    // Wire anchor clicks to close the sheet after navigation.
    for (const a of slots.outline.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      a.addEventListener('click', () => {
        // Let the default anchor-jump fire, then close the sheet a beat
        // later so the operator sees the destination land.
        window.setTimeout(closeSheet, 80);
      });
    }
  }

  function refreshNotesSlot(): void {
    // No-op on mobile: the actual `[data-sidebar-list]` element was moved
    // into the slot at boot, and the annotations controller renders
    // directly into it — its render attaches Edit / Resolve / Delete /
    // scroll-to-mark listeners to live <li> children. There is nothing
    // to refresh from a separate source.
    //
    // The function stays as a hook in case the slot ever needs viewport-
    // aware rebinding (e.g. if we add a "filter notes" UI inside the
    // sheet that re-renders into the slot).
  }

  // ---- Counts -----------------------------------------------------------

  function noteCount(): number {
    const source = document.querySelector<HTMLElement>('[data-sidebar-list]');
    if (!source) return 0;
    return source.querySelectorAll('.er-marginalia-item').length;
  }
  function noteCountLabel(): string {
    const n = noteCount();
    if (n === 0) return 'no marks';
    return `${n} mark${n === 1 ? '' : 's'}`;
  }
  function sectionCountLabel(): string {
    const source = document.querySelector<HTMLElement>('.er-outline-drawer-body');
    if (!source) return '';
    const links = source.querySelectorAll('a[href^="#"]').length;
    if (links === 0) return '';
    return `${links} section${links === 1 ? '' : 's'}`;
  }
  function scrapCount(): number {
    const source = document.querySelector<HTMLElement>('.er-scrapbook-drawer-body');
    if (!source) return 0;
    return source.querySelectorAll('.scrap').length;
  }
  function scrapbookCountLabel(): string {
    const n = scrapCount();
    if (n === 0) return 'no items';
    return `${n} item${n === 1 ? '' : 's'}`;
  }

  function updateNotesCount(): void {
    if (!notesCount) return;
    const n = noteCount();
    if (n === 0) {
      notesCount.hidden = true;
      notesCount.textContent = '0';
    } else {
      notesCount.hidden = false;
      notesCount.textContent = String(n);
    }
    if (currentSheet === 'notes') {
      meta!.textContent = noteCountLabel();
    }
  }

  function updateScrapbookCount(): void {
    if (!scrapbookCount) return;
    const n = scrapCount();
    if (n === 0) {
      scrapbookCount.hidden = true;
      scrapbookCount.textContent = '0';
    } else {
      scrapbookCount.hidden = false;
      scrapbookCount.textContent = String(n);
    }
    if (currentSheet === 'scrapbook') {
      meta!.textContent = scrapbookCountLabel();
    }
  }

  // ---- Event wiring -----------------------------------------------------

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const key = tab.dataset.mobileSheet;
      if (!isSheetKey(key)) return;
      openSheet(key);
    });
  }

  closeBtn?.addEventListener('click', closeSheet);

  // The Save tab triggers the existing edit-toolbar's save handler.
  // It's not a sheet — Save is a direct file mutation (THESIS C2: the
  // single allowed write the studio performs on operator content).
  // Routing through the canonical handler keeps the dirty-state and
  // toast UX in one place.
  const saveTab = bar.querySelector<HTMLButtonElement>('[data-mobile-action="save"]');
  if (saveTab) {
    saveTab.addEventListener('click', () => {
      const target = document.querySelector<HTMLButtonElement>(
        '.er-edit-toolbar [data-action="save-version"]',
      );
      target?.click();
    });
  }

  // Drag-to-dismiss the sheet via the handle. Touch + pointer.
  if (handle) {
    let startY = 0;
    let dragging = false;
    function onStart(y: number): void { startY = y; dragging = true; sheet!.style.transition = 'none'; }
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
      if (dy > 80) closeSheet();
    }
    handle.addEventListener('touchstart', (e) => onStart(e.touches[0]?.clientY ?? 0), { passive: true });
    handle.addEventListener('touchmove', (e) => onMove(e.touches[0]?.clientY ?? 0), { passive: true });
    handle.addEventListener('touchend', (e) => onEnd(e.changedTouches[0]?.clientY ?? 0));
    handle.addEventListener('mousedown', (e) => onStart(e.clientY));
    document.addEventListener('mousemove', (e) => onMove(e.clientY));
    document.addEventListener('mouseup', (e) => onEnd(e.clientY));
  }

  // Tap on the article body's `<mark>` opens Notes sheet + scrolls.
  // Delegate at the body so newly-rendered marks are covered.
  document.addEventListener('click', (ev) => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const mark = target.closest<HTMLElement>('mark[data-annotation-id]');
    if (!mark) return;
    const id = mark.dataset.annotationId;
    if (!id) return;
    // Don't intercept if the click was inside the marginalia composer / sheet.
    if (mark.closest('[data-mobile-sheet-host], [data-comment-composer]')) return;
    ev.preventDefault();
    openNotesAndFocus(id);
  });

  // Tap on a note inside the Notes sheet → close the sheet and flash the
  // article mark. The sidebar-render's per-<li> handler already calls
  // `onScrollTo` (which `mark.scrollIntoView`s); we just need to dismiss
  // the sheet so the operator sees the destination, plus flash the mark
  // for visual feedback. Action buttons (Resolve/Edit/Delete/Cancel/Save)
  // call ev.stopPropagation() so this never fires when those are tapped.
  document.addEventListener('click', (ev) => {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if (currentSheet !== 'notes') return;
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('button, a, [data-comment-composer]')) return;
    if (!target.closest('[data-mobile-sheet-host]')) return;
    const item = target.closest<HTMLElement>('[data-annotation-id]');
    if (!item) return;
    const id = item.dataset.annotationId;
    if (!id) return;
    // Defer close so the existing scroll-to-mark gets a head start.
    window.setTimeout(() => {
      closeSheet();
      const mark = document.querySelector<HTMLElement>(`mark[data-annotation-id="${CSS.escape(id)}"]`);
      if (mark) {
        window.setTimeout(() => flash(mark), SLIDE_MS + 40);
      }
    }, 80);
  });

  function openNotesAndFocus(id: string): void {
    openSheet('notes');
    // Wait for the slide-up + slot population, then scroll the matching note.
    window.setTimeout(() => {
      if (!slots.notes) return;
      const note = slots.notes.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(id)}"]`);
      if (!note) return;
      note.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(note);
    }, SLIDE_MS + 40);
  }

  function scrollArticleToMark(id: string): void {
    const mark = document.querySelector<HTMLElement>(`mark[data-annotation-id="${CSS.escape(id)}"]`);
    if (!mark) {
      // Mark may have been edited/orphaned. Just close the sheet.
      closeSheet();
      return;
    }
    closeSheet();
    // Wait for the sheet's slide-out before scrolling so the destination
    // mark isn't rendered behind a translating overlay.
    window.setTimeout(() => {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(mark);
    }, SLIDE_MS + 40);
  }

  function flash(el: HTMLElement): void {
    el.classList.remove('er-mobile-flash');
    void el.offsetHeight; // force restart of the animation
    el.classList.add('er-mobile-flash');
    window.setTimeout(() => el.classList.remove('er-mobile-flash'), FLASH_MS + 60);
  }

  // Live-track the annotations source for count + sheet refresh.
  const source = document.querySelector<HTMLElement>('[data-sidebar-list]');
  if (source) {
    const obs = new MutationObserver(() => {
      updateNotesCount();
      // If the Notes sheet is open, re-clone so edits/adds reflect live.
      if (currentSheet === 'notes') {
        populatedSlots.delete('notes');
        refreshNotesSlot();
      }
    });
    obs.observe(source, { childList: true, subtree: true });
  }
  updateNotesCount();

  // Same pattern for scrapbook items: the desktop drawer's body is the
  // source of truth; we observe it for adds/deletes (e.g. operator
  // uploads a file via the desktop drawer's drop zone) and refresh
  // the badge + sheet content.
  const scrapSource = document.querySelector<HTMLElement>('.er-scrapbook-drawer-body');
  if (scrapSource) {
    const obs = new MutationObserver(() => {
      updateScrapbookCount();
      if (currentSheet === 'scrapbook') {
        populatedSlots.delete('scrapbook');
        refreshScrapbookSlot();
      }
    });
    obs.observe(scrapSource, { childList: true, subtree: true });
  }
  updateScrapbookCount();

  // Close the sheet on Escape (a11y).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentSheet !== null) closeSheet();
  });

  return {
    openSheet: (key) => {
      if (!window.matchMedia(MOBILE_QUERY).matches) return;
      // Defer to the next frame so the caller's own DOM mutations settle
      // first (e.g. the annotations controller setting composer.hidden =
      // false synchronously before the sheet opens).
      requestAnimationFrame(() => openSheet(key));
    },
    isMobile: () => window.matchMedia(MOBILE_QUERY).matches,
  };
}
