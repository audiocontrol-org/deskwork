/**
 * Entry-review-specific mobile sheet host + strip affordances.
 *
 * Renders the bottom-sheet container with the five named slots
 * (outline / notes / actions / scrapbook / format) the entry-review
 * surface composes against, plus the two phone-only strip affordances
 * (Source/Preview pill, ✕ Done exit) that live in the top strip when
 * editing on phone.
 *
 * The mobile-BAR helper itself is universal — it moved to
 * `../mobile-bar.ts` and accepts a list of `Cell`s the caller supplies
 * to describe each tab. The entry-review consumer composes the
 * pre-refactor 6-cell configuration via `getEntryReviewBarCells()`
 * below.
 *
 * Design references:
 *   - Review tabs: plugins/deskwork-studio/public/mockups/mobile-1-bottom-sheet.html
 *   - Editor tabs: plugins/deskwork-studio/public/mockups/editor-2-press-check-tabbar.html
 *
 * The sheet has five content slots. The client controller
 * (`entry-review/mobile-sheet-bar.ts`) populates each at first open.
 * Slot sources:
 *   - outline: clone of `.er-outline-drawer-body`
 *   - notes:   actual `[data-sidebar-list]` element MOVED in on phone
 *              (preserves event listeners; see mobile-sheet-bar.ts)
 *   - actions: rendered fresh from the decision verbs
 *   - format:  the press-check key grid rendered server-side below
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { Cell } from '../mobile-bar.ts';

/**
 * The entry-review bar's contextual cell list. Six cells; CSS hides
 * the off-mode cells via the `er-mobile-tab--review` /
 * `er-mobile-tab--edit` modifiers (gated on
 * `body[data-edit-mode="editing"]`).
 *
 *   - Review mode visible: Outline · Notes · Scrapbook · Actions
 *   - Edit mode visible:   Format · Notes · Save
 *
 * The Notes tab is mode `'both'` — review notes the operator leaves
 * carry across into edit. The Scrapbook tab uses the kraft-tone count
 * badge to distinguish folio context from action peers.
 */
export function getEntryReviewBarCells(): readonly Cell[] {
  return [
    {
      glyph: '§',
      label: 'Outline',
      mode: 'review',
      action: { kind: 'sheet', name: 'outline' },
    },
    {
      glyph: '¶',
      label: 'Format',
      mode: 'edit',
      action: { kind: 'sheet', name: 'format' },
    },
    {
      glyph: '✎',
      label: 'Notes',
      mode: 'both',
      action: { kind: 'sheet', name: 'notes' },
      count: { dataAttr: 'data-notes-count' },
    },
    {
      glyph: '▦',
      label: 'Scrapbook',
      mode: 'review',
      action: { kind: 'sheet', name: 'scrapbook' },
      count: { dataAttr: 'data-scrapbook-count', tone: 'kraft' },
      modifierClass: 'er-mobile-tab--scrapbook',
    },
    {
      glyph: '⊕',
      label: 'Actions',
      mode: 'review',
      action: { kind: 'sheet', name: 'actions' },
    },
    {
      glyph: '⊕',
      label: 'Save',
      mode: 'edit',
      action: { kind: 'direct', action: 'save' },
      modifierClass: 'er-mobile-tab--save',
    },
  ];
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
        <div class="er-mobile-sheet-slot er-mobile-sheet-slot--scrapbook" data-mobile-sheet-slot="scrapbook" hidden></div>
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
