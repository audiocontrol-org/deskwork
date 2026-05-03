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
 * Strip a YAML frontmatter block from the top of an md file. Only strips
 * the leading `---\n...\n---\n` block; body-level `---` separators (Setext
 * H2 underline, thematic break) are preserved because the function only
 * looks at the first 4 chars for the opener.
 */
function stripFrontmatter(text: string): string {
  if (!text.startsWith('---\n')) return text;
  const closeIdx = text.indexOf('\n---\n', 4);
  if (closeIdx < 0) return text;
  return text.slice(closeIdx + 5).replace(/^\n+/, '');
}

/**
 * Build the closed-state preview excerpt for md/json/txt. Returns null
 * when there's nothing useful to render — empty file, frontmatter-only
 * file, or binary masquerading as text — so the caller can omit the
 * preview block entirely (matches "other" kind treatment, avoids the
 * 6rem min-height void).
 *
 * For json: pretty-print via JSON.parse + JSON.stringify(_, null, 2) so
 * minified single-line files still render multi-line. Falls back to raw
 * content on parse error (bad JSON is still readable as text).
 *
 * Binary detection: NUL byte presence after UTF-8 decode. Real text
 * almost never has NUL; binary files have it within the first KB.
 */
function previewExcerpt(buf: Buffer, kind: 'md' | 'json' | 'txt'): string | null {
  let text = buf.subarray(0, Math.min(buf.byteLength, 2400)).toString('utf-8');
  if (text.indexOf('\0') >= 0) return null;
  if (kind === 'md') text = stripFrontmatter(text);
  if (kind === 'json') {
    try {
      const fullText = buf.toString('utf-8');
      text = JSON.stringify(JSON.parse(fullText), null, 2);
    } catch {
      // Invalid JSON — fall through to the raw-text excerpt below.
    }
  }
  const excerpt = text.split('\n').slice(0, 8).join('\n').slice(0, 600);
  if (excerpt.trim() === '') return null;
  return excerpt;
}

/**
 * Count lines in a text file: number of `\n` bytes plus 1 if the last
 * byte isn't `\n` (so a 3-line file whether or not it has a trailing
 * newline reports 3).
 */
function countLines(buf: Buffer): number {
  let count = 0;
  for (const b of buf) if (b === 0x0a) count++;
  if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) count++;
  return count;
}

/**
 * Count top-level keys in a JSON object. Returns null if the file is not
 * valid JSON or its root is not a plain object (arrays, primitives →
 * null; caller renders no extra meta).
 */
function countJsonKeys(buf: Buffer): number | null {
  try {
    const obj: unknown = JSON.parse(buf.toString('utf-8'));
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.keys(obj).length;
    }
    return null;
  } catch {
    return null;
  }
}

interface ImageDimensions { readonly width: number; readonly height: number; }

/**
 * Read PNG dimensions from the IHDR chunk. Returns null for non-PNG or
 * truncated files. JPEG/WebP/GIF support deferred — most deskwork
 * scrapbook images are screenshots / icons (PNG) and the meta is purely
 * informational, so the empty-string fallback is acceptable for other
 * formats.
 */
function readImageDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Compute the per-kind extra meta string shown after the kind chip + size:
 *   md / txt → "{N} lines"
 *   json     → "{N} keys" (root must be a plain object; otherwise empty)
 *   img      → "{W} × {H}" (PNG only; other formats → empty)
 *   other    → empty
 *
 * ENOENT (race-window with delete) returns empty so the card still
 * renders; other errors propagate to the page renderer.
 */
function computeKindMeta(
  ctx: StudioContext,
  site: string,
  path: string,
  item: ScrapbookItem,
): string {
  if (item.kind !== 'md' && item.kind !== 'txt' && item.kind !== 'json' && item.kind !== 'img') {
    return '';
  }
  let buf: Buffer;
  try {
    const fullPath = scrapbookFilePath(ctx.projectRoot, ctx.config, site, path, item.name);
    buf = readFileSync(fullPath);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return '';
    throw e;
  }
  if (item.kind === 'md' || item.kind === 'txt') return `${countLines(buf)} lines`;
  if (item.kind === 'json') {
    const keys = countJsonKeys(buf);
    return keys !== null ? `${keys} keys` : '';
  }
  // img
  const dims = readImageDimensions(buf);
  return dims ? `${dims.width} × ${dims.height}` : '';
}

/**
 * Server-side preview for the closed-state card. Img → bg-frame URL;
 * md → italic Newsreader excerpt with frontmatter stripped; json → mono
 * pre with parse-then-stringify pretty-print; txt → mono pre raw excerpt.
 * Other / empty / binary-as-text → no preview block.
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
  if (item.kind !== 'md' && item.kind !== 'txt' && item.kind !== 'json') {
    return unsafe('');
  }
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
    const excerpt = previewExcerpt(buf, item.kind);
    if (excerpt === null) return unsafe('');
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
  secretCount: number,
): RawHtml {
  const lastModifiedLabel = lastModified ? formatRelativeTime(lastModified) : '—';
  const publicCount = items.length;
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
  opts: { secret?: boolean } = {},
): RawHtml {
  const { secret = false } = opts;
  const seq = String(index + 1).padStart(2, '0');
  const kindLabel = KIND_LABEL[item.kind];
  const kindClass = item.kind === 'other' ? '' : `scrap-kind--${item.kind}`;
  const time = item.mtime
    ? html`<time class="scrap-time" datetime="${item.mtime}">${formatRelativeTime(item.mtime)}</time>`
    : '';
  const preview = renderPreview(ctx, site, path, item, { secret });
  const kindMeta = computeKindMeta(ctx, site, path, item);
  const kindMetaHtml: RawHtml = kindMeta
    ? unsafe(html`<span>·</span><span>${kindMeta}</span>`)
    : unsafe('');
  const editBtn = item.kind === 'img'
    ? unsafe('')
    : unsafe(html`<button class="scrap-tool" type="button" data-action="edit">edit</button>`);
  // Secret cards get id="secret-item-N" to disambiguate from public ids in
  // restoreFromHash + aside cross-link lookups (F4 contract); the
  // mark-secret action toggle reads "mark public" since clicking it moves
  // the card OUT of the secret section.
  const id = secret ? `secret-item-${index + 1}` : `item-${index + 1}`;
  const markSecretLabel = secret ? 'mark public' : 'mark secret';
  const dataSecretAttr = secret ? ' data-secret="true"' : '';
  return unsafe(html`
    <li class="scrap-card" data-kind="${item.kind}" data-state="closed" id="${id}"${unsafe(dataSecretAttr)}>
      <div class="scrap-card-head">
        <span class="scrap-seq">N° ${seq}</span>
        <span class="scrap-name" data-action="open">${item.name}</span>
        ${unsafe(time)}
      </div>
      <div class="scrap-card-meta">
        <span class="scrap-kind ${kindClass}">${kindLabel}</span>
        <span class="scrap-size">${formatSize(item.size)}</span>
        ${kindMetaHtml}
      </div>
      ${preview}
      <div class="scrap-card-foot">
        <button class="scrap-tool scrap-tool--primary" type="button" data-action="open">open</button>
        ${editBtn}
        <button class="scrap-tool" type="button" data-action="rename">rename</button>
        <button class="scrap-tool" type="button" data-action="mark-secret">${markSecretLabel}</button>
        <span class="spacer"></span>
        <button class="scrap-tool scrap-tool--delete" type="button" data-action="delete">delete</button>
      </div>
    </li>`);
}

/**
 * Inline new-note composer (Phase 34b — #166).
 *
 * Mirrors the pre-F1 inline composer (`44094ee^:scrapbook.ts:274-294`),
 * adapted to the F1 `.scrap-*` design vocabulary. Hidden by default;
 * the aside's `+ new note` button reveals it via the client wire-up.
 *
 * Per `.claude/rules/affordance-placement.md`: component-attached to
 * the page (not a generic toolbar), placed where the resulting note
 * will appear in sorted position. Direct manipulation: in-page form,
 * filename + body + secret toggle visible inline, Cmd/Ctrl+S saves,
 * Esc cancels. Replaces the F1 `window.prompt()` regression (#166).
 */
function renderComposer(): RawHtml {
  return unsafe(html`
    <form class="scrap-composer" data-scrap-composer hidden>
      <header class="scrap-composer-head">
        <span class="scrap-composer-glyph" aria-hidden="true">✎</span>
        <span class="scrap-composer-kicker">NEW NOTE</span>
        <input type="text" class="scrap-composer-filename" data-composer-filename
          placeholder="note-name.md" aria-label="new note filename" />
        <label class="scrap-composer-secret" title="save under scrapbook/secret/ — never published">
          <input type="checkbox" data-composer-secret />
          <span>secret</span>
        </label>
        <button class="scrap-tool" type="button" data-action="composer-cancel">cancel</button>
        <button class="scrap-tool scrap-tool--primary" type="submit" data-action="composer-save">save →</button>
      </header>
      <textarea class="scrap-composer-body" data-composer-body
        placeholder="Write the note in markdown. Cmd/Ctrl+S saves, Esc cancels."
        aria-label="new note body" rows="8"></textarea>
    </form>`);
}

function renderDropZone(): RawHtml {
  return unsafe(html`
    <div class="scrap-drop" role="button" tabindex="0" data-action="upload"
         aria-label="Drop a file here, or press Enter to pick one">
      ── drop a file here, or pick one ──
    </div>`);
}

function renderSecretSection(
  ctx: StudioContext,
  site: string,
  path: string,
  secretItems: readonly ScrapbookItem[],
): RawHtml {
  if (secretItems.length === 0) return unsafe('');
  const cards = secretItems.map((item, i) => renderCard(ctx, site, path, item, i, { secret: true }));
  return unsafe(html`
    <section class="scrap-secret" aria-label="secret items">
      <header class="scrap-secret-head">
        <span class="scrap-secret-mark" aria-hidden="true">⚿</span>
        <h2 class="scrap-secret-title">Secret</h2>
        <span class="scrap-secret-badge">private — never published</span>
      </header>
      <ol class="scrap-cards">
        ${cards}
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
  // listScrapbook returns { exists: false, items: [] } for missing dirs
  // (packages/core/src/scrapbook.ts:337-339), so an empty scrapbook is not
  // an error path. Real errors (slug validation, scrapbookDir resolution
  // failures, FS permission issues) propagate to the studio's error handler.
  const result = listScrapbook(ctx.projectRoot, ctx.config, site, path);
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
  const cards = items.map((item, i) => renderCard(ctx, site, path, item, i));
  const cardsHtml = cards.map((c) => c.__raw).join('');
  const body = html`
    ${renderEditorialFolio('content', `scrapbook · ${site}/${path}`)}
    <main class="scrap-page" data-site="${site}" data-path="${path}">
      ${renderAside(site, path, items, totalSize, lastModified, secretItems.length)}
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
        ${renderSecretSection(ctx, site, path, secretItems)}
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
