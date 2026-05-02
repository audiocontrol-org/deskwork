/**
 * Scrapbook drawer for the review surface — extracted from `review.ts`
 * to keep that file under the project's 500-line guideline.
 *
 * Renders the IMMEDIATE node's scrapbook (no ancestors) per Phase 16c.
 * Always visible: an empty scrapbook still renders the section so the
 * operator sees the affordance for this node.
 *
 * Phase 19c+: when the calendar entry has a stable id binding AND a
 * per-request content index is wired, resolve the on-disk scrapbook
 * directory via the index. This makes writingcontrol-shape entries
 * (slug != fs path) list their items at the actual file location.
 * Falls back to slug-template addressing for unbound / legacy entries.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  listScrapbook,
  listScrapbookAtDir,
  scrapbookDirForEntry,
  type ScrapbookItem,
  type ScrapbookSummary,
} from '@deskwork/core/scrapbook';
import { resolveContentDir } from '@deskwork/core/paths';
import type { ContentIndex } from '@deskwork/core/content-index';
import type { CalendarEntry } from '@deskwork/core/types';
import type { StudioContext } from '../routes/api.ts';
import {
  renderEmptyScrapbookRow,
  renderReadOnlyScrapbookRow,
  scrapbookViewerUrl,
  type InlineTextLoader,
} from '../components/scrapbook-item.ts';
import { html, unsafe, type RawHtml } from './html.ts';

/**
 * Build an inline-text loader for the shared scrapbook-item renderer.
 * Reads at most `maxBytes` from a file inside the scrapbook directory
 * and returns the bytes decoded as UTF-8. Returns null when the file
 * isn't readable as text — the renderer falls back to a download link.
 *
 * Path resolution prefers the index-driven binding (the entry's id is
 * looked up against the per-request content index) so writingcontrol-
 * shape entries — slug `the-outbound`, file at
 * `<contentDir>/projects/the-outbound/index.md` — read scrapbook items
 * from the right on-disk directory. Falls back to the slug-template
 * directory for entries that have no id binding yet (pre-doctor).
 */
function makeInlineTextLoader(
  ctx: StudioContext,
  site: string,
  entry: { id?: string; slug: string } | null,
  slug: string,
  index?: ContentIndex,
): InlineTextLoader {
  const scrapbookDir = entry
    ? scrapbookDirForEntry(ctx.projectRoot, ctx.config, site, entry, index)
    : join(
        resolveContentDir(ctx.projectRoot, ctx.config, site),
        slug,
        'scrapbook',
      );
  return (filename, maxBytes) => {
    try {
      const buf = readFileSync(join(scrapbookDir, filename));
      const slice = buf.subarray(0, Math.min(buf.byteLength, maxBytes));
      return slice.toString('utf-8');
    } catch {
      return null;
    }
  };
}

function renderScrapbookDrawerItems(
  site: string,
  slug: string,
  items: readonly ScrapbookItem[],
  loader: InlineTextLoader,
): RawHtml {
  if (items.length === 0) {
    return renderEmptyScrapbookRow({ site, path: slug });
  }
  const rows = items.map((item) =>
    renderReadOnlyScrapbookRow(
      { site, path: slug },
      item,
      { inlinePreviewLoader: loader },
    ),
  );
  return unsafe(rows.map((r) => r.__raw).join(''));
}

export function renderScrapbookDrawer(
  ctx: StudioContext,
  site: string,
  entry: CalendarEntry | null,
  slug: string,
  index?: ContentIndex,
): RawHtml {
  const summary: ScrapbookSummary | null = (() => {
    try {
      if (entry !== null && entry.id !== undefined && entry.id !== '') {
        const scrapbookDir = scrapbookDirForEntry(
          ctx.projectRoot,
          ctx.config,
          site,
          entry,
          index,
        );
        return listScrapbookAtDir(site, entry.slug, scrapbookDir);
      }
      return listScrapbook(ctx.projectRoot, ctx.config, site, slug);
    } catch {
      // listScrapbook validates the slug; an invalid slug shouldn't
      // tank the whole review page. Treat as empty drawer + log via
      // the unobtrusive empty state.
      return null;
    }
  })();

  const items = summary?.items ?? [];
  const secretItems = summary?.secretItems ?? [];
  const total = items.length + secretItems.length;
  const loader = makeInlineTextLoader(ctx, site, entry, slug, index);

  return unsafe(html`
    <aside class="er-scrapbook-drawer" data-scrapbook-drawer aria-label="Scrapbook for this entry">
      <header class="er-scrapbook-drawer-head">
        <span class="er-scrapbook-drawer-kicker">§ Scrapbook</span>
        <span class="er-scrapbook-drawer-count">${total} ${total === 1 ? 'item' : 'items'}</span>
        <a class="er-scrapbook-drawer-open" href="${scrapbookViewerUrl({ site, path: slug })}"
          title="Open the standalone scrapbook viewer">open ↗</a>
      </header>
      <div class="er-scrapbook-drawer-body">
        ${renderScrapbookDrawerItems(site, slug, items, loader)}
        ${
          secretItems.length > 0
            ? unsafe(html`
                <div class="er-scrapbook-drawer-secret">
                  <p class="er-scrapbook-drawer-secret-head">
                    <span aria-hidden="true">⚿</span> secret · ${secretItems.length}
                  </p>
                  ${renderScrapbookDrawerItems(site, slug, secretItems, loader)}
                </div>`)
            : ''
        }
      </div>
    </aside>`);
}
