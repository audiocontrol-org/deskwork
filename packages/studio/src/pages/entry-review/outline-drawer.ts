/**
 * Outline drawer for the entry-keyed press-check surface (Phase 34a — T9).
 *
 * Relocated from `pages/review.ts:renderOutlineDrawer`. Conditional render
 * when the entry's body markdown carries a `## Outline` section (extracted
 * via `splitOutline`). The pull-tab on the left edge mirrors the marginalia
 * tab pattern on the right edge; the drawer is read-only and links to
 * `/deskwork:iterate --kind outline` for editing.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderOutlineDrawer(outlineHtml: string): RawHtml {
  const hidden = outlineHtml ? '' : ' hidden';
  return unsafe(html`
    <button class="er-outline-tab" data-outline-tab type="button" aria-label="Show outline"${unsafe(hidden)}>
      <span class="er-outline-tab-label">Outline</span>
    </button>
    <aside class="er-outline-drawer" data-outline-drawer aria-label="Outline reference" hidden>
      <header class="er-outline-drawer-head">
        <span class="er-outline-drawer-kicker">Briefing sheet</span>
        <button type="button" class="er-outline-drawer-close" data-outline-close aria-label="Close outline (O or Esc)">×</button>
      </header>
      <div class="er-outline-drawer-body" data-outline-drawer-body>${unsafe(outlineHtml)}</div>
      <footer class="er-outline-drawer-foot">
        <span>Read-only · edit via <code>/deskwork:iterate --kind outline</code></span>
      </footer>
    </aside>`);
}
