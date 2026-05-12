/**
 * Server-side renderer for the masthead `⋮` popover menu (Step 2.2.7).
 *
 * Per `DESIGN-STANDARDS.md § Menu reveal pattern · popover, not slide-up
 * sheet`, the masthead's `⋮` opens a dropdown popover anchored UNDER the
 * glyph, with an up-pointing arrow registered to the glyph's
 * x-position. The popover does NOT use Phase 2.1's `createSlideUpSheet`
 * — that primitive is reserved for bottom-anchored affordances.
 *
 * The HTML scaffold emitted here lives hidden in the DOM until the
 * companion client controller (`mobile-shell/masthead-popover.ts`)
 * toggles it open. The scaffold has three sections, in order:
 *
 *   1. Operator help    · Manual + Keyboard shortcuts
 *   2. Configure        · Configure studio (Phase 4 placeholder)
 *   3. Connect          · File an issue + About deskwork
 *
 * Companion CSS lives in `mobile-shell.css` under the
 * `.er-masthead-popover-*` class vocabulary. The popover is mobile-only
 * (≤600px) — desktop keeps existing per-surface chrome.
 *
 * Mirrors the v7 mockup's `.v7-popover` block faithfully (renamed
 * `v7-` → `er-masthead-popover-` to match the project's BEM-ish
 * namespace).
 */

import { html, unsafe, type RawHtml } from './html.ts';

const MANUAL_HREF = '/dev/editorial-help';
const ISSUE_HREF = 'https://github.com/audiocontrol-org/deskwork/issues/new';

/**
 * Render the popover scaffold + scrim. Returns RawHtml so callers can
 * embed it directly in their page template literals. The element is
 * hidden by default; the client controller sets `hidden=false` to open.
 *
 * The scrim is a sibling element placed BEFORE the popover so it sits
 * underneath in stacking order. Both elements share the
 * `data-er-masthead-popover` / `data-er-masthead-popover-scrim` hooks
 * the client controller uses to wire dismiss handlers.
 */
export function renderMastheadMenu(): RawHtml {
  return unsafe(html`
    <div
      class="er-masthead-popover-scrim"
      data-er-masthead-popover-scrim
      hidden
    ></div>
    <div
      class="er-masthead-popover"
      data-er-masthead-popover
      role="menu"
      aria-labelledby="masthead-menu-trigger"
      hidden
    >
      <div class="er-masthead-popover-section">
        <div class="er-masthead-popover-section-label">Operator help</div>
        <a
          class="er-masthead-popover-item"
          href="${MANUAL_HREF}"
          role="menuitem"
        >
          <span class="er-masthead-popover-item-glyph">§</span>
          <span class="er-masthead-popover-item-body">
            <span class="er-masthead-popover-item-label">Manual</span>
            <span class="er-masthead-popover-item-route">${MANUAL_HREF}</span>
          </span>
          <span class="er-masthead-popover-item-arrow" aria-hidden="true">›</span>
        </a>
        <button
          type="button"
          class="er-masthead-popover-item"
          data-er-masthead-popover-action="shortcuts"
          role="menuitem"
        >
          <span class="er-masthead-popover-item-glyph er-masthead-popover-item-glyph--blue">⌘</span>
          <span class="er-masthead-popover-item-body">
            <span class="er-masthead-popover-item-label">Keyboard shortcuts</span>
            <span class="er-masthead-popover-item-route">opens overlay</span>
          </span>
          <span class="er-masthead-popover-item-arrow" aria-hidden="true">›</span>
        </button>
      </div>
      <div class="er-masthead-popover-section">
        <div class="er-masthead-popover-section-label">Configure</div>
        <button
          type="button"
          class="er-masthead-popover-item er-masthead-popover-item--future"
          data-er-masthead-popover-action="configure"
          data-disabled="true"
          aria-disabled="true"
          role="menuitem"
        >
          <span class="er-masthead-popover-item-glyph er-masthead-popover-item-glyph--kraft">⊞</span>
          <span class="er-masthead-popover-item-body">
            <span class="er-masthead-popover-item-label">Configure studio</span>
            <span class="er-masthead-popover-item-route">.deskwork/config.json <span class="er-masthead-popover-item-future-tag">phase 4</span></span>
          </span>
          <span class="er-masthead-popover-item-arrow" aria-hidden="true">›</span>
        </button>
      </div>
      <div class="er-masthead-popover-section">
        <div class="er-masthead-popover-section-label">Connect</div>
        <a
          class="er-masthead-popover-item"
          href="${ISSUE_HREF}"
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
        >
          <span class="er-masthead-popover-item-glyph er-masthead-popover-item-glyph--blue">✎</span>
          <span class="er-masthead-popover-item-body">
            <span class="er-masthead-popover-item-label">File an issue</span>
            <span class="er-masthead-popover-item-route">github · new tab</span>
          </span>
          <span class="er-masthead-popover-item-arrow er-masthead-popover-item-arrow--external" aria-hidden="true">↗</span>
        </a>
        <a
          class="er-masthead-popover-item"
          href="${MANUAL_HREF}"
          role="menuitem"
        >
          <span class="er-masthead-popover-item-glyph">❡</span>
          <span class="er-masthead-popover-item-body">
            <span class="er-masthead-popover-item-label">About deskwork</span>
            <span class="er-masthead-popover-item-route">manual · GPL-3.0</span>
          </span>
          <span class="er-masthead-popover-item-arrow" aria-hidden="true">›</span>
        </a>
      </div>
    </div>`);
}
