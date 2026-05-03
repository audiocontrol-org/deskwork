/**
 * Editorial folio — sticky cross-page nav rendered atop every studio
 * surface (dashboard, longform review, shortform, content view, scrapbook,
 * help, and the studio index).
 *
 * Single component, every consumer. Markup intentionally flat (no
 * inner wrapper) so the folio can flex its three children — wordmark,
 * spine, nav — directly. The active surface is marked with a red-pencil
 * underline drawn via `::after` in editorial-nav.css.
 *
 * Layout invariant: the folio is `position: fixed; top: 0` and other
 * fixed chrome (the review surface's `.er-strip`) sits BELOW it at
 * `top: var(--er-folio-h)`. Earlier versions used `position: sticky` +
 * a lower z-index, which left the folio eclipsed by the longform
 * review's strip — the user couldn't see the global nav at all on
 * review pages.
 */

import { html, unsafe, type RawHtml } from './html.ts';

/**
 * The set of values callers can pass as the active key. The first five
 * map to a nav-item that gets `class="active"`; `'longform'` is a
 * special "no nav match" key for the longform review surface — it
 * carries an active context (we ARE inside a review) but no nav-item
 * represents that destination, so none gets highlighted. Issue 4 fixed
 * the prior behaviour where the longform review highlighted the
 * shortform nav-item by prefix-matching, which was misleading.
 */
export type ChromeActiveLink =
  | 'index'
  | 'dashboard'
  | 'content'
  | 'shortform'
  | 'manual'
  | 'longform';

interface FolioLink {
  key: Exclude<ChromeActiveLink, 'longform'>;
  href: string;
  label: string;
}

const NAV_LINKS: readonly FolioLink[] = [
  { key: 'index', href: '/dev/', label: 'Index' },
  { key: 'dashboard', href: '/dev/editorial-studio', label: 'Dashboard' },
  { key: 'content', href: '/dev/content', label: 'Content' },
  { key: 'shortform', href: '/dev/editorial-review-shortform', label: 'Shortform' },
  { key: 'manual', href: '/dev/editorial-help', label: 'Manual' },
];

/**
 * Render the folio strip. `spineLabel` is the page-specific subtitle
 * shown to the right of the wordmark ("press-check", "the shape of the
 * work", "longform · <slug>", etc.). When omitted the spine renders
 * empty (an `aria-hidden` placeholder so the flex layout stays balanced
 * across pages).
 */
export function renderEditorialFolio(
  active: ChromeActiveLink,
  spineLabel?: string,
): RawHtml {
  const links = NAV_LINKS.map((link) => {
    const cls = link.key === active ? 'active' : '';
    const aria = link.key === active ? ' aria-current="page"' : '';
    return html`<a class="${cls}" href="${link.href}"${unsafe(aria)}>${link.label}</a>`;
  }).join('');

  const spine = spineLabel
    ? html`<span class="er-folio-spine">${spineLabel}</span>`
    : '<span class="er-folio-spine" aria-hidden="true"></span>';

  return unsafe(html`
    <header class="er-folio" role="banner">
      <span class="er-folio-mark">deskwork</span>
      ${unsafe(spine)}
      <nav class="er-folio-nav" aria-label="Studio sections">
        ${unsafe(links)}
      </nav>
    </header>`);
}
