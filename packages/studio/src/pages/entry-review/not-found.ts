/**
 * 404 shell for the entry-keyed press-check surface (Phase 34a Layer 2).
 *
 * Preserves the existing `er-entry-shell--missing` markup so the
 * `entry-review-styling.test.ts` 404-variant assertion still applies.
 */

import { html } from '../html.ts';
import { layout } from '../layout.ts';

export function renderEntryNotFound(entryId: string, reason: string): string {
  const body = html`
    <main class="er-entry-shell er-entry-shell--missing">
      <h1>Entry not found</h1>
      <p>No sidecar matched <code>${entryId}</code>.</p>
      <p class="er-entry-detail">${reason}</p>
      <p><a href="/dev/editorial-studio">Back to the studio</a></p>
    </main>`;
  return layout({
    title: 'Entry not found — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/entry-review.css',
    ],
    bodyAttrs: 'data-review-ui="entry-review-missing"',
    bodyHtml: body,
    scriptModules: [],
  });
}
