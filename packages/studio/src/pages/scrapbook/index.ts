/**
 * Scrapbook viewer — `/dev/scrapbook/:site/<path>`.
 *
 * Issue #161 redesign: aside-left folder card with numbered item list,
 * vertical card grid with per-kind colored ribbons + always-visible foot
 * toolbar + per-kind preview rendering, drop zone, secret section,
 * single-expanded card invariant, aside cross-linking.
 *
 * The implementation is split across this directory (one module per
 * concern, each under the 500-line cap). This file is the orchestrator:
 * dispatch listing, build the render context, compose the chrome.
 *
 * Mockup: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html
 * Spec:   docs/superpowers/specs/2026-05-02-scrapbook-redesign-impl-spec.md
 */

import type { StudioContext } from '../../routes/api.ts';
import { html, unsafe } from '../html.ts';
import { layout } from '../layout.ts';
import { renderEditorialFolio } from '../chrome.ts';
import { ScrapbookPageError, resolveListing } from './dispatch.ts';
import {
  countByKind,
  renderAside,
  renderBreadcrumb,
  renderCard,
  renderComposer,
  renderDropZone,
  renderFilterChips,
  renderSearch,
  renderSecretSection,
} from './render.ts';
import type { RenderCtx } from './types.ts';

export { ScrapbookPageError } from './dispatch.ts';

export async function renderScrapbookPage(
  ctx: StudioContext,
  site: string,
  path: string,
  opts: { entryId?: string } = {},
): Promise<string> {
  // Validate site against the project's configured site list. Without
  // this check, an unknown site key reaches the path resolver and
  // produces either an opaque error or a path traversal vector.
  if (!(site in ctx.config.sites)) {
    throw new ScrapbookPageError(`unknown site: ${site}`, 404);
  }
  const requestedEntryId =
    opts.entryId !== undefined && opts.entryId.length > 0 ? opts.entryId : null;
  const { scrapbookDir, result, resolvedEntryId } = await resolveListing(
    ctx,
    site,
    path,
    requestedEntryId,
  );
  const items = result.items;
  const secretItems = result.secretItems;
  const totalSize = items.reduce((s, i) => s + i.size, 0);
  const lastModified = items.reduce<string | null>((acc, i) => {
    if (!i.mtime) return acc;
    if (!acc || i.mtime > acc) return i.mtime;
    return acc;
  }, null);
  const counts = countByKind(items);
  const folderLabel = path.split('/').filter(Boolean).pop() ?? path;
  // Effective entryId for URL emission: prefer the request-supplied id
  // (so the client's mutation requests round-trip through the same
  // addressing mode) and fall back to the slug-mode lookup result.
  const effectiveEntryId = requestedEntryId ?? resolvedEntryId;
  const rctx: RenderCtx = effectiveEntryId !== null
    ? { studio: ctx, site, path, entryId: effectiveEntryId, scrapbookDir }
    : { studio: ctx, site, path, scrapbookDir };
  const cards = items.map((item, i) => renderCard(rctx, item, i));
  const cardsHtml = cards.map((c) => c.__raw).join('');
  const reviewLink =
    effectiveEntryId !== null
      ? `/dev/editorial-review/entry/${effectiveEntryId}`
      : null;
  // The data-entry-id attribute is consumed by scrapbook-client.ts —
  // when present, the client sends `entryId` on mutation requests so
  // writes resolve via `scrapbookDirForEntry` (#191). Falls back to
  // `data-path` slug-template addressing when absent.
  // entryId comes from a UUID lookup — already validated against the
  // calendar's CalendarEntry.id, so no escaping concern beyond the
  // belt-and-braces unsafe wrapping for the conditional attribute.
  const entryIdAttr =
    effectiveEntryId !== null
      ? unsafe(` data-entry-id="${effectiveEntryId}"`)
      : unsafe('');
  const body = html`
    ${renderEditorialFolio('content', `scrapbook · ${site}/${path}`)}
    <main class="scrap-page" data-site="${site}" data-path="${path}"${entryIdAttr}>
      ${renderAside(site, path, items, totalSize, lastModified, secretItems.length, reviewLink)}
      <section class="scrap-main">
        <header class="scrap-main-header">
          ${renderBreadcrumb(site, path)}
          ${renderSearch()}
        </header>
        ${renderFilterChips(counts)}
        ${renderComposer()}
        <ol class="scrap-cards" id="cards" data-scrap-cards>
          ${unsafe(cardsHtml)}
        </ol>
        ${renderDropZone()}
        ${renderSecretSection(rctx, secretItems)}
      </section>
    </main>`;
  return layout({
    title: `scrapbook · ${folderLabel} — dev`,
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/scrapbook.css',
      '/static/css/blog-figure.css',
    ],
    bodyAttrs: 'data-review-ui="scrapbook"',
    bodyHtml: body,
    scriptModules: ['scrapbook-client'],
  });
}
