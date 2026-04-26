/**
 * Scrapbook viewer — `/dev/scrapbook/:site/:slug`.
 *
 * Reads the per-article scrapbook directory (notes, receipts, drops),
 * lists every file with type chips + relative timestamps, and renders
 * the composer + drop zone for adding new ones. Empty scrapbooks
 * render only the empty-state with a "+ new note" + "+ upload file"
 * pair.
 *
 * Port of `pages/dev/scrapbook/[site]/[slug].astro`. Layout swap
 * (Astro `<Layout>` → studio shell) and CSS link added; otherwise
 * structurally identical.
 */

import {
  formatRelativeTime,
  formatSize,
  listScrapbook,
  type ScrapbookItem,
} from '@deskwork/core/scrapbook';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';

function renderItemRow(item: ScrapbookItem, index: number): RawHtml {
  const editBtn =
    item.kind === 'md'
      ? unsafe(html`<button type="button" class="scrapbook-tool" data-action="edit">edit</button>`)
      : '';
  const seq = String(index + 1).padStart(2, '0');
  const kindLabel = item.kind === 'other' ? '·' : item.kind.toUpperCase();
  return unsafe(html`
    <li class="scrapbook-item" data-state="closed" data-open="false"
      data-filename="${item.name}" data-kind="${item.kind}"
      data-size="${item.size}" data-mtime="${item.mtime}"
      id="item-${encodeURIComponent(item.name)}">
      <button type="button" class="scrapbook-item-header" aria-expanded="false">
        <span class="scrapbook-seq" aria-hidden="true">§ ${seq}</span>
        <span class="scrapbook-kind scrapbook-kind--${item.kind}" aria-hidden="true">${kindLabel}</span>
        <span class="scrapbook-filename" data-filename-cell>${item.name}</span>
        <time class="scrapbook-mtime" datetime="${item.mtime}">${formatRelativeTime(item.mtime)}</time>
        <span class="scrapbook-disclosure" aria-hidden="true">▸</span>
      </button>
      <div class="scrapbook-toolbar" data-toolbar>
        ${editBtn}
        <button type="button" class="scrapbook-tool" data-action="rename">rename</button>
        <button type="button" class="scrapbook-tool scrapbook-tool--delete" data-action="delete">delete</button>
      </div>
      <div class="scrapbook-perforation" aria-hidden="true"></div>
      <div class="scrapbook-item-body" data-body>
        <div data-body-content></div>
      </div>
    </li>`);
}

function renderIndexSidebar(items: readonly ScrapbookItem[], site: string, slug: string): RawHtml {
  const totalBytes = items.reduce((acc, item) => acc + item.size, 0);
  const lastModified =
    items.length > 0
      ? items.reduce((a, b) => (a.mtime > b.mtime ? a : b)).mtime
      : null;
  return unsafe(html`
    <aside class="scrapbook-index">
      <p class="scrapbook-index-kicker">
        <span aria-hidden="true">§</span> The folder
      </p>
      <p class="scrapbook-index-meta">${slug}</p>
      <p class="scrapbook-index-meta">${site}</p>
      <hr />
      <ol class="scrapbook-index-list" data-scrapbook-index>
        ${items.map(
          (item, i) => unsafe(html`<li data-index-for="${item.name}">
            <span class="scrapbook-index-num">No. ${String(i + 1).padStart(2, '0')}</span>
            <a href="#item-${encodeURIComponent(item.name)}">${item.name}</a>
          </li>`),
        )}
      </ol>
      <hr />
      <p class="scrapbook-index-totals">${items.length} ${items.length === 1 ? 'item' : 'items'} · ${formatSize(totalBytes)}</p>
      ${
        lastModified
          ? unsafe(html`<p class="scrapbook-index-subtotal">last modified ${formatRelativeTime(lastModified)}</p>`)
          : ''
      }
      <hr />
      <div class="scrapbook-index-actions">
        <button type="button" class="scrapbook-index-btn" data-action="new-note">+ new note</button>
        <button type="button" class="scrapbook-index-btn" data-action="upload">+ upload file</button>
      </div>
      <hr />
      <p class="scrapbook-index-path">${site}/${slug}/scrapbook/</p>
    </aside>`);
}

function renderEmpty(): RawHtml {
  return unsafe(html`
    <section class="scrapbook-empty">
      <p>
        This scrapbook is empty. Write the first note, or drop a file
        anywhere on this page.
      </p>
      <div class="scrapbook-empty-actions">
        <button type="button" class="scrapbook-index-btn" data-action="new-note">+ new note</button>
        <button type="button" class="scrapbook-index-btn" data-action="upload">+ upload file</button>
      </div>
    </section>`);
}

function renderReadingPanel(items: readonly ScrapbookItem[]): RawHtml {
  return unsafe(html`
    <section class="scrapbook-reading">
      <form class="scrapbook-composer" data-scrapbook-composer hidden>
        <div class="scrapbook-composer-header">
          <span class="scrapbook-composer-seq" aria-hidden="true">✎</span>
          <span class="scrapbook-composer-kind">NEW</span>
          <input type="text" class="scrapbook-composer-filename" data-composer-filename
            placeholder="note-name.md" aria-label="new note filename" />
          <div class="scrapbook-editor-footer" style="margin: 0;">
            <button type="button" class="scrapbook-tool" data-action="composer-cancel">cancel</button>
            <button type="submit" class="scrapbook-tool scrapbook-tool--primary" data-action="composer-save">save →</button>
          </div>
        </div>
        <div class="scrapbook-composer-body">
          <textarea data-composer-body
            placeholder="Write the note in markdown. Cmd/Ctrl+S saves."
            aria-label="new note body"></textarea>
        </div>
      </form>
      <ol class="scrapbook-items" data-scrapbook-items>
        ${items.map((item, i) => renderItemRow(item, i))}
      </ol>
      <div class="scrapbook-drop" data-scrapbook-drop role="button" tabindex="0"
        aria-label="upload a file to the scrapbook">
        <span class="scrapbook-drop-label">── drop a file here, or pick one ──</span>
        <input type="file" data-scrapbook-file-input
          accept="image/*,application/json,text/plain,text/markdown,.md,.json,.txt" />
      </div>
    </section>`);
}

export function renderScrapbookPage(
  ctx: StudioContext,
  site: string,
  slug: string,
): string {
  const summary = listScrapbook(ctx.projectRoot, ctx.config, site, slug);
  const items = summary.items;

  const inner = items.length === 0
    ? renderEmpty().__raw
    : renderReadingPanel(items).__raw + renderIndexSidebar(items, site, slug).__raw;

  const body = html`
    <main class="scrapbook-page" data-site="${site}" data-slug="${slug}" data-scrapbook-root>
      <header class="scrapbook-header">
        <p class="scrapbook-kicker">
          <span class="scrapbook-kicker-mark" aria-hidden="true">§</span>
          Scrapbook
        </p>
        <h1 class="scrapbook-title">
          <a href="/dev/editorial-review/${slug}?site=${site}"
            title="open the review surface for this article">${slug}</a>
        </h1>
        <p class="scrapbook-meta">${slug} · ${site}</p>
        <a class="scrapbook-back" href="/dev/editorial-studio">← back to the desk</a>
        <hr />
      </header>
      <div class="scrapbook-status" data-scrapbook-status hidden></div>
      ${unsafe(inner)}
      <div class="scrapbook-drop-overlay" data-scrapbook-overlay aria-hidden="true">
        <span class="scrapbook-drop-overlay-text">drop to add to the scrapbook ◇</span>
      </div>
    </main>`;

  return layout({
    title: `scrapbook · ${slug} — dev`,
    cssHrefs: ['/static/css/scrapbook.css'],
    bodyHtml: body,
    scriptModules: ['/static/dist/scrapbook-client.js'],
  });
}
