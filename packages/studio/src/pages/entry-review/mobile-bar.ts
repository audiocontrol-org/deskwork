/**
 * Mobile bottom-bar + sheet host for the entry-keyed review surface.
 *
 * Renders a 3-tab bottom bar (Outline · Notes · Actions) and a sheet
 * host that slides up from the viewport bottom. Visible only at
 * <48rem (phone widths) — see editorial-review.css. Above that the
 * bar and sheet are display:none and the desktop layout (in-flow
 * marginalia column, outline-drawer overlay, decision strip in the
 * top strip) carries the surface.
 *
 * Design reference: plugins/deskwork-studio/public/mockups/mobile-1-bottom-sheet.html
 *
 * The sheet has three content slots (outline / notes / actions). The
 * client controller (`entry-review/mobile-sheet-bar.ts`) populates
 * the slot content at open time by cloning from the existing desktop
 * sources (`.er-outline-drawer-body`, `.er-marginalia-list`, the
 * decision-strip buttons). This keeps the source-of-truth single — the
 * desktop renderers feed both viewport classes.
 *
 * The bar's "Notes" tab carries a count badge driven by the live
 * annotation count (the controller subscribes to the annotations
 * controller's render).
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderMobileBar(): RawHtml {
  return unsafe(html`
    <nav class="er-mobile-bar" data-mobile-bar aria-label="Review surface tabs">
      <button class="er-mobile-tab" data-mobile-sheet="outline" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">
        <span class="er-mobile-tab-glyph" aria-hidden="true">§</span>
        <span class="er-mobile-tab-label">Outline</span>
      </button>
      <button class="er-mobile-tab" data-mobile-sheet="notes" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">
        <span class="er-mobile-tab-glyph" aria-hidden="true">✎</span>
        <span class="er-mobile-tab-label">Notes</span>
        <span class="er-mobile-tab-count" data-notes-count hidden>0</span>
      </button>
      <button class="er-mobile-tab" data-mobile-sheet="actions" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">
        <span class="er-mobile-tab-glyph" aria-hidden="true">⊕</span>
        <span class="er-mobile-tab-label">Actions</span>
      </button>
    </nav>`);
}

export function renderMobileSheet(): RawHtml {
  return unsafe(html`
    <section
      class="er-mobile-sheet"
      id="er-mobile-sheet"
      data-mobile-sheet-host
      hidden
      aria-label="Review sheet"
      role="dialog"
      aria-modal="false"
    >
      <button class="er-mobile-sheet-handle" data-mobile-sheet-handle type="button" aria-label="Drag to dismiss the sheet">
        <span class="er-mobile-sheet-handle-bar" aria-hidden="true"></span>
      </button>
      <header class="er-mobile-sheet-head">
        <span class="er-mobile-sheet-kicker" data-mobile-sheet-kicker></span>
        <span class="er-mobile-sheet-meta" data-mobile-sheet-meta></span>
        <button class="er-mobile-sheet-close" data-mobile-sheet-close type="button" aria-label="Close sheet">×</button>
      </header>
      <div class="er-mobile-sheet-body" data-mobile-sheet-body>
        <div class="er-mobile-sheet-slot" data-mobile-sheet-slot="outline" hidden></div>
        <div class="er-mobile-sheet-slot" data-mobile-sheet-slot="notes" hidden></div>
        <div class="er-mobile-sheet-slot" data-mobile-sheet-slot="actions" hidden></div>
      </div>
    </section>`);
}
