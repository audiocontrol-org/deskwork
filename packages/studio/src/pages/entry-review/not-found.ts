/**
 * 404 shell for the entry-keyed press-check surface (Phase 34a Layer 2).
 *
 * Carries the folio chrome so the cross-page nav stays consistent with
 * every other surface (folio-cross-page.test.ts asserts every reachable
 * URL renders the er-folio strip).
 */

import { html, unsafe } from '../html.ts';
import { layout } from '../layout.ts';
import { renderEditorialFolio } from '../chrome.ts';

export function renderEntryNotFound(entryId: string, reason: string): string {
  const folio = renderEditorialFolio('longform', `longform · ${entryId}`);
  const body = html`
    <div data-review-ui="entry-review-missing" class="er-review-shell">
      ${unsafe(folio.__raw)}
      <main class="er-entry-shell er-entry-shell--missing">
        <h1>Entry not found</h1>
        <p>No sidecar matched <code>${entryId}</code>.</p>
        <p class="er-entry-detail">${reason}</p>
        <p><a href="/dev/editorial-studio">Back to the studio</a></p>
      </main>
    </div>`;
  return layout({
    title: 'Entry not found — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/entry-review.css',
    ],
    bodyHtml: body,
    scriptModules: [],
  });
}
