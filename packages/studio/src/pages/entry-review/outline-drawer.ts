/**
 * Outline + TOC drawer for the entry-keyed press-check surface.
 *
 * Two stacked sections inside the same drawer:
 *   1. Curated outline (#169-pre, T9). Conditional on the entry's body
 *      markdown carrying a `## Outline` section (extracted via
 *      `splitOutline`). When present, this is the operator's hand-
 *      authored briefing sheet — read-only here; edit via
 *      `/deskwork:iterate --kind outline`.
 *   2. Table of contents (#244). Auto-extracted from the rendered
 *      body's h2/h3/h4 headings (each carries a slugified `id` from
 *      rehype-slug). Always visible when there are 2+ entries; clicks
 *      jump to the heading via native `<a href="#id">` smooth-scroll.
 *
 * The pull-tab on the left edge surfaces whenever EITHER section has
 * content. The drawer is `position: fixed` so it never scrolls out
 * of view.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { TocEntry } from '@deskwork/core/review/toc';

export function renderOutlineDrawer(
  outlineHtml: string,
  tocEntries: readonly TocEntry[] = [],
): RawHtml {
  const hasOutline = outlineHtml.length > 0;
  const hasToc = tocEntries.length >= 2;
  const tabHidden = hasOutline || hasToc ? '' : ' hidden';

  // Drawer kicker label: prefer "Outline" when there's a curated
  // outline (the briefing-sheet heritage); otherwise "Contents" since
  // the auto-TOC is the dominant content. Both sections may render
  // simultaneously when the entry has both.
  const kicker = hasOutline ? 'Briefing sheet' : 'Contents';

  return unsafe(html`
    <button class="er-outline-tab" data-outline-tab type="button" aria-label="Show outline / contents"${unsafe(tabHidden)}>
      <span class="er-outline-tab-label">Outline</span>
    </button>
    <aside class="er-outline-drawer" data-outline-drawer aria-label="Outline + table of contents" hidden>
      <header class="er-outline-drawer-head">
        <span class="er-outline-drawer-kicker">${kicker}</span>
        <button type="button" class="er-outline-drawer-close" data-outline-close aria-label="Close outline (O or Esc)">×</button>
      </header>
      <div class="er-outline-drawer-body" data-outline-drawer-body>
        ${unsafe(hasOutline ? outlineHtml : '')}
        ${unsafe(hasOutline && hasToc ? '<hr class="er-outline-drawer-rule" />' : '')}
        ${unsafe(hasToc ? renderTocList(tocEntries) : '')}
      </div>
      <footer class="er-outline-drawer-foot">
        ${unsafe(hasOutline
          ? '<span>Read-only · edit via <code>/deskwork:iterate --kind outline</code></span>'
          : '<span>Auto-extracted from headings · jump-link to navigate</span>')}
      </footer>
    </aside>`);
}

/**
 * Render the auto-TOC as an indented list of anchor links. Depth maps
 * directly to nesting level: depth-2 entries are top-level, depth-3
 * entries indent once, depth-4 entries indent twice. The flat HTML
 * shape is easier to style than nested <ul>s and reads correctly with
 * a screen reader as long as the depth class carries an aria
 * attribute (set in CSS via `aria-level`).
 */
function renderTocList(entries: readonly TocEntry[]): string {
  const items = entries
    .map((e) => html`
      <li class="er-toc-item er-toc-item--d${e.depth}" data-toc-target="${e.id}">
        <a class="er-toc-link" href="#${e.id}" data-toc-link>${e.text}</a>
      </li>`)
    .join('');
  return html`
    <nav class="er-toc" aria-label="Table of contents">
      <ul class="er-toc-list">${unsafe(items)}</ul>
    </nav>`;
}
