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
 * map to a nav-item that gets `class="active"`; `'longform'`, `'lanes'`,
 * and `'pipelines'` are "no nav match" keys for surfaces that carry an
 * active context (we ARE inside a review / on a lane-management page /
 * on a pipeline-registry page) but whose destination is not represented
 * by a folio nav-item — so none gets highlighted.
 *
 * Issue 4 added `'longform'` after the prior behaviour highlighted the
 * shortform nav-item by prefix-matching, which was misleading.
 * AUDIT-20260530-76 (cross-model: AUDIT-BARRAGE-codex-P6-2) added
 * `'lanes'` and `'pipelines'` after both pages were passing `'dashboard'`
 * — assistive tech was told the Dashboard link was the current page on
 * `/dev/lanes` and `/dev/pipelines`, which is incorrect link semantics.
 * Lanes and pipelines do not have dedicated folio nav-items; the
 * correct shape is "no link is current."
 */
export type ChromeActiveLink =
  | 'index'
  | 'dashboard'
  | 'content'
  | 'shortform'
  | 'manual'
  | 'longform'
  | 'lanes'
  | 'pipelines';

interface FolioLink {
  key: Exclude<ChromeActiveLink, 'longform' | 'lanes' | 'pipelines'>;
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
