/**
 * Editorial chrome — sticky top-of-page strip with brand + nav links.
 *
 * Phase 16d adds a "Content" link to the existing top-nav. The chrome
 * is rendered as a separate function so the dashboard, review, and
 * content pages can all share one source of truth.
 *
 * For now, this only renders chrome when explicitly invoked from a
 * page render. Existing pages (dashboard, review) keep their bespoke
 * mastheads — adding the chrome to them is a separate refactor that
 * the content view doesn't gate on.
 */

import { html, unsafe, type RawHtml } from './html.ts';
import type { StudioContext } from '../routes/api.ts';

export type ChromeActiveLink =
  | 'dashboard'
  | 'content'
  | 'reviews'
  | 'manual';

interface ChromeLink {
  key: ChromeActiveLink;
  href: string;
  label: string;
}

const NAV_LINKS: ChromeLink[] = [
  { key: 'dashboard', href: '/dev/editorial-studio', label: 'Dashboard' },
  { key: 'content', href: '/dev/content', label: 'Content' },
  { key: 'reviews', href: '/dev/editorial-review-shortform', label: 'Reviews' },
  { key: 'manual', href: '/dev/editorial-help', label: 'Manual' },
];

function siteSummary(ctx: StudioContext): string {
  const slugs = Object.keys(ctx.config.sites);
  if (slugs.length === 1) return slugs[0];
  return `${slugs.length} sites`;
}

export function renderEditorialChrome(
  ctx: StudioContext,
  active: ChromeActiveLink,
): RawHtml {
  const links = NAV_LINKS.map(
    (link) =>
      html`<a class="${link.key === active ? 'active' : ''}" href="${link.href}">${link.label}</a>`,
  ).join('');
  return unsafe(html`
    <header class="ed-chrome">
      <div class="ed-chrome__inner">
        <div class="ed-chrome__brand">deskwork<sup>STUDIO</sup></div>
        <div class="ed-chrome__site"><b>${siteSummary(ctx)}</b></div>
        <nav class="ed-chrome__nav" aria-label="Studio sections">
          ${unsafe(links)}
        </nav>
      </div>
    </header>`);
}
