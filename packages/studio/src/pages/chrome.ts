/**
 * Editorial folio — sticky cross-page nav rendered atop every studio
 * surface (dashboard, longform review, shortform, content view, scrapbook,
 * help, and the studio index).
 *
 * Three-column grid: wordmark / nav / spine. The active surface gets a
 * red-pencil tick mark drawn via `::before` — reads like an editor
 * circled where you are, not a UI selected state.
 *
 * Phase 17: replaces the prior `renderEditorialChrome` (Writer's Catalog
 * `.ed-chrome` strip), which only the bird's-eye content view used.
 * The folio commits to the editorial-print design language so every
 * surface shares one cross-page nav. CSS lives in
 * `plugins/deskwork-studio/public/css/editorial-nav.css` and uses the
 * existing `--er-*` tokens — no new variables.
 */

import { html, unsafe, type RawHtml } from './html.ts';

export type ChromeActiveLink =
  | 'index'
  | 'dashboard'
  | 'content'
  | 'reviews'
  | 'manual';

interface FolioLink {
  key: ChromeActiveLink;
  href: string;
  label: string;
}

const NAV_LINKS: readonly FolioLink[] = [
  { key: 'index', href: '/dev/', label: 'Index' },
  { key: 'dashboard', href: '/dev/editorial-studio', label: 'Dashboard' },
  { key: 'content', href: '/dev/content', label: 'Content' },
  { key: 'reviews', href: '/dev/editorial-review-shortform', label: 'Reviews' },
  { key: 'manual', href: '/dev/editorial-help', label: 'Manual' },
];

/**
 * Render the folio strip. `spineLabel` is the page-specific subtitle
 * shown at the right edge ("press-check", "the shape of the work",
 * "index of the press", etc.). Defaults to no spine when omitted —
 * which collapses to a 2-column layout.
 */
export function renderEditorialFolio(
  active: ChromeActiveLink,
  spineLabel?: string,
): RawHtml {
  const links = NAV_LINKS.map((link) => {
    const cls = link.key === active ? 'active' : '';
    return html`<a class="${cls}" href="${link.href}">${link.label}</a>`;
  }).join('');

  const spine = spineLabel
    ? html`<div class="er-folio-spine">${spineLabel}</div>`
    : '<div class="er-folio-spine" aria-hidden="true"></div>';

  return unsafe(html`
    <header class="er-folio">
      <div class="er-folio-inner">
        <div class="er-folio-name">deskwork <em>STUDIO</em></div>
        <nav class="er-folio-nav" aria-label="Studio sections">
          ${unsafe(links)}
        </nav>
        ${unsafe(spine)}
      </div>
    </header>`);
}
