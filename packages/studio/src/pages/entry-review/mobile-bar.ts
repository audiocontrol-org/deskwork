/**
 * Mobile bottom-bar + sheet host for the entry-keyed review surface.
 *
 * Renders a 3-tab bottom bar and a sheet host that slides up from the
 * viewport bottom. Visible only at <48rem (phone widths) — see
 * editorial-review.css. Above that the bar and sheet are display:none
 * and the desktop layout (in-flow marginalia column, outline-drawer
 * overlay, decision strip in the top strip) carries the surface.
 *
 * Design references:
 *   - Review tabs: plugins/deskwork-studio/public/mockups/mobile-1-bottom-sheet.html
 *   - Editor tabs: plugins/deskwork-studio/public/mockups/editor-2-press-check-tabbar.html
 *
 * The bar carries FIVE tab buttons; CSS shows three at a time keyed
 * off `body[data-edit-mode="editing"]`:
 *   - Review mode: Outline · Notes · Actions
 *   - Edit mode:   Format  · Notes · Save
 * The Notes tab is shared between modes (review notes the operator
 * leaves carry across into edit). The bar's data-mode attribute is
 * also flipped by the client so additional state-dependent styles
 * (Save dirty glow, etc.) can key off it.
 *
 * The sheet has four content slots (outline / notes / actions / format).
 * The client controller (`entry-review/mobile-sheet-bar.ts`) populates
 * each at first open. Slot sources:
 *   - outline: clone of `.er-outline-drawer-body`
 *   - notes:   actual `[data-sidebar-list]` element MOVED in on phone
 *              (preserves event listeners; see mobile-sheet-bar.ts)
 *   - actions: rendered fresh from the decision verbs
 *   - format:  the press-check key grid rendered server-side below
 *
 * The Save tab is NOT a sheet — it triggers the existing
 * `[data-action="save-version"]` handler directly (the one allowed
 * file mutation per THESIS Consequence 2).
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderMobileBar(): RawHtml {
  return unsafe(html`
    <nav class="er-mobile-bar" data-mobile-bar aria-label="Surface tabs">
      <button class="er-mobile-tab er-mobile-tab--review" data-mobile-sheet="outline" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">
        <span class="er-mobile-tab-glyph" aria-hidden="true">§</span>
        <span class="er-mobile-tab-label">Outline</span>
      </button>
      <button class="er-mobile-tab er-mobile-tab--edit" data-mobile-sheet="format" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">
        <span class="er-mobile-tab-glyph" aria-hidden="true">¶</span>
        <span class="er-mobile-tab-label">Format</span>
      </button>
      <button class="er-mobile-tab" data-mobile-sheet="notes" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">
        <span class="er-mobile-tab-glyph" aria-hidden="true">✎</span>
        <span class="er-mobile-tab-label">Notes</span>
        <span class="er-mobile-tab-count" data-notes-count hidden>0</span>
      </button>
      <button class="er-mobile-tab er-mobile-tab--review" data-mobile-sheet="actions" type="button" aria-controls="er-mobile-sheet" aria-expanded="false">
        <span class="er-mobile-tab-glyph" aria-hidden="true">⊕</span>
        <span class="er-mobile-tab-label">Actions</span>
      </button>
      <button class="er-mobile-tab er-mobile-tab--edit er-mobile-tab--save" data-mobile-action="save" type="button">
        <span class="er-mobile-tab-glyph" aria-hidden="true">⊕</span>
        <span class="er-mobile-tab-label">Save</span>
      </button>
    </nav>`);
}

function renderFormatGrid(): string {
  return html`
    <div class="er-fkey-section">Headings</div>
    <div class="er-fkey-grid">
      <button type="button" class="er-fkey er-fkey--h1" data-fkey="h1"><span class="er-fkey-face">H1</span><span class="er-fkey-label">Title</span></button>
      <button type="button" class="er-fkey er-fkey--h2" data-fkey="h2"><span class="er-fkey-face">H2</span><span class="er-fkey-label">Section</span></button>
      <button type="button" class="er-fkey er-fkey--h3" data-fkey="h3"><span class="er-fkey-face">H3</span><span class="er-fkey-label">Sub</span></button>
      <button type="button" class="er-fkey er-fkey--hr" data-fkey="hr"><span class="er-fkey-face">— · — · —</span><span class="er-fkey-label">Rule</span></button>
    </div>
    <div class="er-fkey-section">Inline</div>
    <div class="er-fkey-grid">
      <button type="button" class="er-fkey er-fkey--bold" data-fkey="bold"><span class="er-fkey-face"><strong>B</strong></span><span class="er-fkey-label">Bold</span></button>
      <button type="button" class="er-fkey er-fkey--em" data-fkey="em"><span class="er-fkey-face"><em>I</em></span><span class="er-fkey-label">Italic</span></button>
      <button type="button" class="er-fkey er-fkey--code" data-fkey="code"><span class="er-fkey-face">\` \`</span><span class="er-fkey-label">Code</span></button>
      <button type="button" class="er-fkey er-fkey--link" data-fkey="link"><span class="er-fkey-face">link</span><span class="er-fkey-label">Link</span></button>
    </div>
    <div class="er-fkey-section">Block</div>
    <div class="er-fkey-grid">
      <button type="button" class="er-fkey er-fkey--list" data-fkey="list"><span class="er-fkey-face">— ·<br>— ·</span><span class="er-fkey-label">List</span></button>
      <button type="button" class="er-fkey er-fkey--ol" data-fkey="ol"><span class="er-fkey-face">1·<br>2·</span><span class="er-fkey-label">Numbered</span></button>
      <button type="button" class="er-fkey er-fkey--quote" data-fkey="quote"><span class="er-fkey-face">"</span><span class="er-fkey-label">Quote</span></button>
      <button type="button" class="er-fkey er-fkey--fence" data-fkey="fence"><span class="er-fkey-face">\`\`\`</span><span class="er-fkey-label">Code block</span></button>
    </div>`;
}

export function renderMobileSheet(): RawHtml {
  return unsafe(html`
    <section
      class="er-mobile-sheet"
      id="er-mobile-sheet"
      data-mobile-sheet-host
      hidden
      aria-label="Surface sheet"
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
        <div class="er-mobile-sheet-slot er-mobile-sheet-slot--format" data-mobile-sheet-slot="format" hidden>${unsafe(renderFormatGrid())}</div>
      </div>
    </section>`);
}

/**
 * Phone-only Source/Preview pill rendered into the top strip when in
 * edit mode. Uses the same `data-edit-view` attribute as the desktop
 * edit toolbar so `editModeBtns` (queried via that attribute in
 * entry-review-client.ts) auto-binds clicks. CSS reveals it only on
 * phone + edit mode; the desktop edit toolbar is hidden in that
 * combination.
 */
export function renderStripModeSegment(): RawHtml {
  return unsafe(html`
    <span class="er-strip-mode-mobile" data-strip-mode-mobile aria-hidden="true">
      <button type="button" class="er-strip-mode-btn" data-edit-view="source" aria-pressed="true">Source</button>
      <button type="button" class="er-strip-mode-btn" data-edit-view="preview" aria-pressed="false">Preview</button>
    </span>`);
}

/**
 * Phone-only "✕ Done" exit affordance in the strip. Visible only when
 * editing on phone (CSS-gated). Click dispatches into the existing
 * toggle-edit handler — preserves the confirmDiscard prompt when the
 * buffer is dirty, immediate exit when clean. Sits alongside the
 * existing back-link (which continues to navigate home regardless of
 * mode) so the operator always has both "leave editor" and "leave
 * page" affordances available.
 */
export function renderStripEditExit(): RawHtml {
  return unsafe(html`
    <button type="button" class="er-strip-edit-done" data-strip-edit-done aria-label="Exit editor">
      <span class="er-strip-edit-done-glyph" aria-hidden="true">✕</span>
      <span class="er-strip-edit-done-label">Done</span>
    </button>`);
}
