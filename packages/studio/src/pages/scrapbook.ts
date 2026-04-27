/**
 * Scrapbook viewer — `/dev/scrapbook/:site/<path>` (path may include `/`).
 *
 * Reads the scrapbook directory at the given path and lists every
 * file with type chips + relative timestamps, plus secret items
 * (inside `scrapbook/secret/`) in a quiet second section. Empty
 * scrapbooks render an empty state with quick-add affordances.
 *
 * The `path` argument is the hierarchical address of the scrapbook —
 * any slash-separated kebab-case identifier under the site's
 * contentDir. It does not need to correspond to a calendar entry;
 * organizational nodes (e.g. `the-outbound/characters` with no
 * own README) can host their own scrapbooks too.
 *
 * Port of `pages/dev/scrapbook/[site]/[slug].astro`. Layout swap
 * (Astro `<Layout>` → studio shell) and CSS link added; structurally
 * similar otherwise.
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
import { renderEditorialFolio } from './chrome.ts';

interface RenderItemRowOptions {
  /** Mark the row visually as belonging to the secret section. */
  secret?: boolean;
  /** When true, render disclosure controls + toolbar. False for secret rows in the v1 read-only secret surface. */
  withTools?: boolean;
}

function renderItemRow(
  item: ScrapbookItem,
  index: number,
  opts: RenderItemRowOptions = {},
): RawHtml {
  const { secret = false, withTools = true } = opts;
  const editBtn =
    withTools && item.kind === 'md'
      ? unsafe(html`<button type="button" class="scrapbook-tool" data-action="edit">edit</button>`)
      : '';
  const seq = String(index + 1).padStart(2, '0');
  const kindLabel = item.kind === 'other' ? '·' : item.kind.toUpperCase();
  const idPrefix = secret ? 'secret-' : '';
  const dataSecret = secret ? ' data-secret="true"' : '';
  const toolbar = withTools
    ? unsafe(html`<div class="scrapbook-toolbar" data-toolbar>
        ${editBtn}
        <button type="button" class="scrapbook-tool" data-action="rename">rename</button>
        <button type="button" class="scrapbook-tool scrapbook-tool--delete" data-action="delete">delete</button>
      </div>`)
    : '';
  return unsafe(html`
    <li class="scrapbook-item${secret ? ' scrapbook-item--secret' : ''}" data-state="closed" data-open="false"
      data-filename="${item.name}" data-kind="${item.kind}"
      data-size="${item.size}" data-mtime="${item.mtime}"${unsafe(dataSecret)}
      id="${idPrefix}item-${encodeURIComponent(item.name)}">
      <button type="button" class="scrapbook-item-header" aria-expanded="false">
        <span class="scrapbook-seq" aria-hidden="true">§ ${seq}</span>
        <span class="scrapbook-kind scrapbook-kind--${item.kind}" aria-hidden="true">${kindLabel}</span>
        <span class="scrapbook-filename" data-filename-cell>${item.name}</span>
        <time class="scrapbook-mtime" datetime="${item.mtime}">${formatRelativeTime(item.mtime)}</time>
        <span class="scrapbook-disclosure" aria-hidden="true">▸</span>
      </button>
      ${toolbar}
      <div class="scrapbook-perforation" aria-hidden="true"></div>
      <div class="scrapbook-item-body" data-body>
        <div data-body-content></div>
      </div>
    </li>`);
}

/**
 * Build a hierarchical breadcrumb from the path. Each segment links to
 * the scrapbook view for its prefix. The root segment (site) just
 * goes back to the editorial dashboard.
 */
function renderBreadcrumb(site: string, path: string): RawHtml {
  const segments = path.split('/');
  const links: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const prefix = segments.slice(0, i + 1).join('/');
    const isLast = i === segments.length - 1;
    if (isLast) {
      links.push(html`<span class="scrapbook-breadcrumb-current">${segments[i]}</span>`);
    } else {
      links.push(
        html`<a class="scrapbook-breadcrumb-link" href="/dev/scrapbook/${site}/${prefix}">${segments[i]}</a>`,
      );
    }
  }
  const sep = '<span class="scrapbook-breadcrumb-sep" aria-hidden="true">›</span>';
  const joined = links.join(`\n${sep}\n`);
  return unsafe(html`
    <nav class="scrapbook-breadcrumb" aria-label="scrapbook hierarchy">
      <a class="scrapbook-breadcrumb-link" href="/dev/editorial-studio">${site}</a>
      <span class="scrapbook-breadcrumb-sep" aria-hidden="true">›</span>
      ${unsafe(joined)}
    </nav>`);
}

function renderIndexSidebar(items: readonly ScrapbookItem[], site: string, path: string): RawHtml {
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
      <p class="scrapbook-index-meta">${path}</p>
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
      <p class="scrapbook-index-path">${site}/${path}/scrapbook/</p>
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

/**
 * Quiet second section listing items inside `scrapbook/secret/`. Read-
 * only in v1 — operators populate the directory by hand or via the
 * core API; the studio surface just shows what's there. The "private"
 * badge gives unmistakable visual differentiation from the public
 * items above.
 */
function renderSecretSection(items: readonly ScrapbookItem[]): RawHtml {
  return unsafe(html`
    <section class="scrapbook-secret" data-scrapbook-secret>
      <header class="scrapbook-secret-header">
        <span class="scrapbook-secret-mark" aria-hidden="true">⚿</span>
        <h2 class="scrapbook-secret-title">Secret</h2>
        <span class="scrapbook-secret-badge" aria-label="private — never published">
          private
        </span>
        <span class="scrapbook-secret-count">
          ${items.length} ${items.length === 1 ? 'item' : 'items'}
        </span>
      </header>
      <p class="scrapbook-secret-help">
        Items inside <code>scrapbook/secret/</code>. Excluded from the
        public site by the host's content-collection patterns.
      </p>
      <ol class="scrapbook-items scrapbook-items--secret">
        ${items.map((item, i) =>
          renderItemRow(item, i, { secret: true, withTools: false }),
        )}
      </ol>
    </section>`);
}

export function renderScrapbookPage(
  ctx: StudioContext,
  site: string,
  path: string,
): string {
  // Validate site against the project's configured site list. Without
  // this check, an unknown site key reaches the path resolver and
  // produces either an opaque error or a path traversal vector.
  if (!(site in ctx.config.sites)) {
    throw new Error(`unknown site: ${site}`);
  }
  const summary = listScrapbook(ctx.projectRoot, ctx.config, site, path);
  const items = summary.items;
  const secretItems = summary.secretItems;

  const publicBlock =
    items.length === 0
      ? renderEmpty().__raw
      : renderReadingPanel(items).__raw + renderIndexSidebar(items, site, path).__raw;

  const secretBlock = secretItems.length > 0 ? renderSecretSection(secretItems).__raw : '';

  const body = html`
    ${renderEditorialFolio('content', `scrapbook · ${site}/${path}`)}
    <main class="scrapbook-page" data-site="${site}" data-slug="${path}" data-scrapbook-root>
      <header class="er-pagehead er-pagehead--compact scrapbook-header">
        ${renderBreadcrumb(site, path)}
        <p class="er-pagehead__kicker scrapbook-kicker">
          <span class="scrapbook-kicker-mark" aria-hidden="true">§</span>
          Scrapbook
        </p>
        <h1 class="er-pagehead__title scrapbook-title">${path}</h1>
        <a class="scrapbook-back" href="/dev/editorial-studio">← back to the desk</a>
      </header>
      <div class="scrapbook-status" data-scrapbook-status hidden></div>
      ${unsafe(publicBlock)}
      ${unsafe(secretBlock)}
      <div class="scrapbook-drop-overlay" data-scrapbook-overlay aria-hidden="true">
        <span class="scrapbook-drop-overlay-text">drop to add to the scrapbook ◇</span>
      </div>
    </main>`;

  return layout({
    title: `scrapbook · ${path} — dev`,
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/scrapbook.css',
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    scriptModules: ['/static/dist/scrapbook-client.js'],
  });
}
