/*
 * Content view client (Phase 16d, extended in v0.6.0).
 *
 * Currently a tiny entry: wires up the scrapbook lightbox so image
 * thumbnails inside the content view's detail panel scrap rows open
 * in the in-context overlay (#29). The detail panel renders
 * server-side; this script attaches click listeners after the DOM is
 * ready.
 *
 * Kept as a separate bundle (not inlined into a larger client) so
 * pages that don't need it pay zero JS cost. Loaded by content.ts.
 */

import { initScrapbookLightbox } from './lightbox.ts';

function init(): void {
  initScrapbookLightbox(document);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
