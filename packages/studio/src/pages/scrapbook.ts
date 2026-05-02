/**
 * Scrapbook viewer — `/dev/scrapbook/:site/<path>`.
 *
 * Issue #161 redesign: aside-left folder card with numbered item list,
 * vertical card grid with per-kind colored ribbons + always-visible foot
 * toolbar + per-kind preview rendering, drop zone, secret section,
 * single-expanded card invariant, aside cross-linking.
 *
 * Mockup: docs/superpowers/frontend-design/2026-05-02-review-redesign/scrapbook-redesign.html
 * Spec:   docs/superpowers/specs/2026-05-02-scrapbook-redesign-impl-spec.md
 */

import { readFileSync } from 'node:fs';
import {
  formatRelativeTime,
  formatSize,
  listScrapbook,
  scrapbookFilePath,
  type ScrapbookItem,
  type ScrapbookItemKind,
} from '@deskwork/core/scrapbook';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

const KIND_LABEL: Record<ScrapbookItemKind, string> = {
  md: 'MD',
  img: 'IMG',
  json: 'JSON',
  js: 'JS',
  txt: 'TXT',
  other: '·',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Server-side preview for the closed-state card. Img → bg-frame URL;
 * md → plain-text excerpt of first paragraphs; json/txt → mono pre.
 * Other → no preview block.
 *
 * F1 emits the basic shape; F2 refines per-kind details (line clamping,
 * frontmatter strip, mono pre clamping).
 */
function renderPreview(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
  opts: { secret?: boolean } = {},
): RawHtml {
  const { secret = false } = opts;
  if (item.kind === 'img') {
    const params = new URLSearchParams({ site, path, name: item.name });
    if (secret) params.set('secret', '1');
    const url = `/api/dev/scrapbook-file?${params.toString()}`;
    return unsafe(html`
      <div class="scrap-preview scrap-preview--img" aria-hidden="true">
        <div class="scrap-preview--img-frame" style="background-image: url(&quot;${url}&quot;);"></div>
      </div>`);
  }
  if (item.kind === 'md' || item.kind === 'txt' || item.kind === 'json') {
    try {
      const fullPath = scrapbookFilePath(
        ctx.projectRoot,
        ctx.config,
        site,
        path,
        item.name,
        secret ? { secret: true } : {},
      );
      const buf = readFileSync(fullPath);
      const text = buf
        .subarray(0, Math.min(buf.byteLength, 1200))
        .toString('utf-8');
      const lines = text.split('\n');
      const excerpt = lines.slice(0, 8).join('\n').slice(0, 600);
      const safe = escapeHtml(excerpt);
      if (item.kind === 'json' || item.kind === 'txt') {
        return unsafe(html`
          <pre class="scrap-preview scrap-preview--mono" aria-hidden="true">${unsafe(safe)}</pre>`);
      }
      return unsafe(html`
        <div class="scrap-preview scrap-preview-md" aria-hidden="true"><p>${unsafe(safe)}</p></div>`);
    } catch (e) {
      // ENOENT = file disappeared between listScrapbook and this read (race
      // window with delete); rendering an empty preview is the right call.
      // Anything else (EACCES, EISDIR, encoding bugs) propagates so the
      // operator sees a real error instead of a silently-broken page.
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
        return unsafe('');
      }
      throw e;
    }
  }
  return unsafe('');
}

interface KindCounts {
  all: number;
  md: number;
  img: number;
  json: number;
  js: number;
  txt: number;
  other: number;
}

function countByKind(items: readonly ScrapbookItem[]): KindCounts {
  const counts: KindCounts = {
    all: items.length,
    md: 0,
    img: 0,
    json: 0,
    js: 0,
    txt: 0,
    other: 0,
  };
  for (const i of items) counts[i.kind]++;
  return counts;
}

function renderFilterChips(counts: KindCounts): RawHtml {
  const chip = (kind: keyof KindCounts, label: string, isAll = false): RawHtml =>
    unsafe(html`
    <button class="scrap-filter" type="button" data-filter="${kind}"
      aria-pressed="${isAll ? 'true' : 'false'}">${label} · ${counts[kind]}</button>`);
  return unsafe(html`
    <div class="scrap-filters" role="toolbar" aria-label="filter by kind">
      ${chip('all', 'all', true)}
      ${chip('md', 'md')}
      ${chip('img', 'img')}
      ${chip('json', 'json')}
      ${chip('txt', 'txt')}
      ${chip('other', 'other')}
    </div>`);
}

function renderSearch(): RawHtml {
  return unsafe(html`
    <div class="scrap-search">
      <input type="search" placeholder="filter by name or content" aria-label="filter scrapbook" data-scrap-search />
      <span class="scrap-search-kbd">/</span>
    </div>`);
}

function renderBreadcrumb(site: string, path: string): RawHtml {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? path;
  return unsafe(html`
    <nav class="scrap-breadcrumb" aria-label="hierarchy">
      <a href="/dev/content/${site}">${site}</a><span class="sep">›</span>
      <b>${last}</b>
    </nav>`);
}

function renderAside(
  site: string,
  path: string,
  items: readonly ScrapbookItem[],
  totalSize: number,
  lastModified: string | null,
): RawHtml {
  const lastModifiedLabel = lastModified ? formatRelativeTime(lastModified) : '—';
  const publicCount = items.length;
  const secretCount = 0;
  const sizeLabel = formatSize(totalSize);
  const folderLabel = path.split('/').filter(Boolean).pop() ?? path;
  const fullPath = `${site}/${path}/scrapbook/`;
  return unsafe(html`
    <aside class="scrap-aside">
      <p class="scrap-aside-kicker"><em>§</em> The folder</p>
      <h1 class="scrap-aside-title">${folderLabel}</h1>
      <p class="scrap-aside-meta">${site}</p>
      <hr />
      <p class="scrap-aside-totals">
        <strong>${publicCount}</strong> public ·
        <strong>${secretCount}</strong> secret ·
        <em>${sizeLabel}</em>
      </p>
      <p class="scrap-aside-meta">last modified ${lastModifiedLabel}</p>
      <hr />
      <ol class="scrap-aside-list" data-scrap-aside-list>
        ${items.map((item, i) => {
          const seq = String(i + 1).padStart(2, '0');
          return unsafe(html`<li><span class="num">${seq}</span><a href="#item-${i + 1}" data-scrap-aside-link>${item.name}</a></li>`);
        })}
      </ol>
      <hr />
      <div class="scrap-aside-actions">
        <button class="scrap-aside-btn scrap-aside-btn--primary" type="button" data-action="new-note">+ new note</button>
        <button class="scrap-aside-btn" type="button" data-action="upload">+ upload file</button>
      </div>
      <hr />
      <p class="scrap-aside-path">${fullPath}</p>
    </aside>`);
}

function renderCard(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
  index: number,
): RawHtml {
  const seq = String(index + 1).padStart(2, '0');
  const kindLabel = KIND_LABEL[item.kind];
  const kindClass = item.kind === 'other' ? '' : `scrap-kind--${item.kind}`;
  const time = item.mtime
    ? html`<time class="scrap-time" datetime="${item.mtime}">${formatRelativeTime(item.mtime)}</time>`
    : '';
  const preview = renderPreview(ctx, site, path, item);
  const editBtn = item.kind === 'img'
    ? unsafe('')
    : unsafe(html`<button class="scrap-tool" type="button" data-action="edit">edit</button>`);
  return unsafe(html`
    <li class="scrap-card" data-kind="${item.kind}" data-state="closed" id="item-${index + 1}">
      <div class="scrap-card-head">
        <span class="scrap-seq">N° ${seq}</span>
        <span class="scrap-name" data-action="open">${item.name}</span>
        ${unsafe(time)}
      </div>
      <div class="scrap-card-meta">
        <span class="scrap-kind ${kindClass}">${kindLabel}</span>
        <span class="scrap-size">${formatSize(item.size)}</span>
      </div>
      ${preview}
      <div class="scrap-card-foot">
        <button class="scrap-tool scrap-tool--primary" type="button" data-action="open">open</button>
        ${editBtn}
        <button class="scrap-tool" type="button" data-action="rename">rename</button>
        <button class="scrap-tool" type="button" data-action="mark-secret">mark secret</button>
        <span class="spacer"></span>
        <button class="scrap-tool scrap-tool--delete" type="button" data-action="delete">delete</button>
      </div>
    </li>`);
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
  // listScrapbook returns { exists: false, items: [] } for missing dirs
  // (packages/core/src/scrapbook.ts:337-339), so an empty scrapbook is not
  // an error path. Real errors (slug validation, scrapbookDir resolution
  // failures, FS permission issues) propagate to the studio's error handler.
  const result = listScrapbook(ctx.projectRoot, ctx.config, site, path);
  const items = result.items;
  const totalSize = items.reduce((s, i) => s + i.size, 0);
  const lastModified = items.reduce<string | null>((acc, i) => {
    if (!i.mtime) return acc;
    if (!acc || i.mtime > acc) return i.mtime;
    return acc;
  }, null);
  const counts = countByKind(items);
  const folderLabel = path.split('/').filter(Boolean).pop() ?? path;
  const cards = items.map((item, i) => renderCard(ctx, site, path, item, i));
  const cardsHtml = cards.map((c) => c.__raw).join('');
  const body = html`
    ${renderEditorialFolio('content', `scrapbook · ${site}/${path}`)}
    <main class="scrap-page" data-site="${site}" data-path="${path}">
      ${renderAside(site, path, items, totalSize, lastModified)}
      <section class="scrap-main">
        <header class="scrap-main-header">
          ${renderBreadcrumb(site, path)}
          ${renderSearch()}
        </header>
        ${renderFilterChips(counts)}
        <ol class="scrap-cards" id="cards" data-scrap-cards>
          ${unsafe(cardsHtml)}
        </ol>
        ${unsafe('<!-- F5: drop zone + secret section -->')}
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
