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

import { copyOrShowFallback } from '../clipboard.ts';

const MOBILE_QUERY = '(max-width: 48rem)';
const FLASH_MS = 1100;
const SLIDE_MS = 280;

type SheetKey = 'outline' | 'notes' | 'actions';

interface SheetBarDeps {
  readonly entrySlug: string;
  readonly entryUuid: string;
}

export function initMobileSheetBar(deps: SheetBarDeps): void {
  const bar = document.querySelector<HTMLElement>('[data-mobile-bar]');
  const sheet = document.querySelector<HTMLElement>('[data-mobile-sheet-host]');
  if (!bar || !sheet) return;

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
  };
  const kicker = sheet.querySelector<HTMLElement>('[data-mobile-sheet-kicker]');
  const meta = sheet.querySelector<HTMLElement>('[data-mobile-sheet-meta]');
  const handle = sheet.querySelector<HTMLElement>('[data-mobile-sheet-handle]');
  const closeBtn = sheet.querySelector<HTMLButtonElement>('[data-mobile-sheet-close]');
  const notesCount = bar.querySelector<HTMLElement>('[data-notes-count]');

  if (!slots.outline || !slots.notes || !slots.actions || !kicker || !meta) return;

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
    for (const slotKey of Object.keys(slots) as SheetKey[]) {
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
    } else {
      kicker!.textContent = '⊕ Actions';
      meta!.textContent = '';
    }
  }

  // ---- Slot population --------------------------------------------------

  let populatedSlots: Set<SheetKey> = new Set();

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
    else if (key === 'actions') populateActionsSlot();
    populatedSlots.add(key);
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
      slots.outline.appendChild(child.cloneNode(true) as HTMLElement);
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
    if (!slots.notes) return;
    const source = document.querySelector<HTMLOListElement>('[data-sidebar-list]');
    if (!source) return;

    // Build a fresh list by cloning items. Each cloned item carries its
    // own `data-annotation-id` so the bidirectional handler can resolve
    // back to the article mark.
    slots.notes.innerHTML = '';
    const list = document.createElement('ol');
    list.className = 'er-marginalia-list er-mobile-notes-list';
    list.setAttribute('data-mobile-notes-list', '');
    const empty = document.createElement('p');
    empty.className = 'er-marginalia-empty';
    empty.textContent = 'No margin notes yet — select text in the article to leave one.';

    const items = Array.from(source.querySelectorAll<HTMLLIElement>('.er-marginalia-item'));
    if (items.length === 0) {
      slots.notes.appendChild(empty);
      return;
    }
    for (const item of items) {
      const clone = item.cloneNode(true) as HTMLLIElement;
      // Inline styles from marginalia-position (absolute top/left) are
      // meaningless in the sheet's flow context; strip them.
      clone.style.position = '';
      clone.style.top = '';
      clone.style.left = '';
      clone.style.right = '';
      clone.style.transform = '';
      list.appendChild(clone);
    }
    slots.notes.appendChild(list);

    // Wire each cloned note: tap → close sheet + scroll article to mark.
    for (const note of list.querySelectorAll<HTMLElement>('[data-annotation-id]')) {
      note.addEventListener('click', (ev) => {
        // Avoid hijacking taps on inline buttons inside the note (resolve,
        // edit, delete, etc.).
        const target = ev.target;
        if (target instanceof HTMLElement && target.closest('button, a')) return;
        const id = note.dataset.annotationId;
        if (!id) return;
        ev.preventDefault();
        scrollArticleToMark(id);
      });
    }
  }

  function populateActionsSlot(): void {
    if (!slots.actions) return;
    slots.actions.innerHTML = '';
    const actions: Array<{
      key: 'approve' | 'iterate' | 'reject' | 'cancel';
      label: string;
      glyph: string;
      meta: string;
      verb: string;
    }> = [
      { key: 'approve', label: 'Approve',  glyph: '✓', meta: 'Stage advance', verb: 'approve' },
      { key: 'iterate', label: 'Iterate',  glyph: '↻', meta: 'New version',   verb: 'iterate' },
      { key: 'reject',  label: 'Reject',   glyph: '✕', meta: 'Send back',     verb: 'reject' },
      { key: 'cancel',  label: 'Cancel',   glyph: '⊘', meta: 'Stop work',     verb: 'cancel' },
    ];
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'er-mobile-action';
      btn.dataset.action = a.key;
      btn.innerHTML = `<span class="er-mobile-action-glyph" aria-hidden="true">${a.glyph}</span>${a.label}<span class="er-mobile-action-meta">${a.meta}</span>`;
      btn.addEventListener('click', async () => {
        const command = `/deskwork:${a.verb} ${deps.entrySlug}`;
        await copyOrShowFallback(command, {
          successMessage: `Copied — paste into a Claude Code chat to run \`${command}\`.`,
          fallbackMessage: `Clipboard unavailable. Copy this command and paste it into a Claude Code chat: \`${command}\``,
        });
        closeSheet();
      });
      slots.actions.appendChild(btn);
    }
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

  // ---- Event wiring -----------------------------------------------------

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const key = tab.dataset.mobileSheet as SheetKey | undefined;
      if (!key) return;
      openSheet(key);
    });
  }

  closeBtn?.addEventListener('click', closeSheet);

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

  // Close the sheet on Escape (a11y).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentSheet !== null) closeSheet();
  });
}
