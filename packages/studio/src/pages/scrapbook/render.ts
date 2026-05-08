/**
 * Scrapbook page render helpers — RawHtml emitters for cards, previews,
 * the aside, the new-note composer, the drop zone, the secret section,
 * and the breadcrumb / search / filter chrome.
 *
 * Reads filesystem only via `computeKindMeta` and `renderPreview`; both
 * resolve through the pre-resolved `RenderCtx.scrapbookDir` (set by the
 * dispatch step) so render stays free of path-resolution logic.
 */

import { readFileSync } from 'node:fs';
import {
  formatRelativeTime,
  formatSize,
  scrapbookFilePathAtDir,
  type ScrapbookItem,
  type ScrapbookItemKind,
} from '@deskwork/core/scrapbook';
import { html, unsafe, type RawHtml } from '../html.ts';
import {
  countJsonKeys,
  countLines,
  escapeHtml,
  previewExcerpt,
} from './text-helpers.ts';
import { readImageDimensions } from './image-readers.ts';
import type { RenderCtx } from './types.ts';

const KIND_LABEL: Record<ScrapbookItemKind, string> = {
  md: 'MD',
  img: 'IMG',
  json: 'JSON',
  js: 'JS',
  txt: 'TXT',
  other: '·',
};

export interface KindCounts {
  all: number;
  md: number;
  img: number;
  json: number;
  js: number;
  txt: number;
  other: number;
}

export function countByKind(items: readonly ScrapbookItem[]): KindCounts {
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
export function computeKindMeta(
  rctx: RenderCtx,
  item: ScrapbookItem,
  opts: { secret?: boolean } = {},
): string {
  if (item.kind !== 'md' && item.kind !== 'txt' && item.kind !== 'json' && item.kind !== 'img') {
    return '';
  }
  let buf: Buffer;
  try {
    const fullPath = scrapbookFilePathAtDir(
      rctx.scrapbookDir,
      item.name,
      opts.secret ? { secret: true } : {},
    );
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
 * Build the file-fetch URL for the read-only binary endpoint. Prefers
 * entry-aware addressing when `rctx.entryId` is set (#205); falls back
 * to slug-template addressing (`path=`) otherwise.
 */
function buildFileFetchUrl(
  rctx: RenderCtx,
  filename: string,
  secret: boolean,
): string {
  const params = new URLSearchParams({ site: rctx.site, name: filename });
  if (rctx.entryId !== undefined && rctx.entryId.length > 0) {
    params.set('entryId', rctx.entryId);
  } else {
    params.set('path', rctx.path);
  }
  if (secret) params.set('secret', '1');
  return `/api/dev/scrapbook-file?${params.toString()}`;
}

/**
 * Server-side preview for the closed-state card. Img → bg-frame URL;
 * md → italic Newsreader excerpt with frontmatter stripped; json → mono
 * pre with parse-then-stringify pretty-print; txt → mono pre raw excerpt.
 * Other / empty / binary-as-text → no preview block.
 */
export function renderPreview(
  rctx: RenderCtx,
  item: ScrapbookItem,
  opts: { secret?: boolean } = {},
): RawHtml {
  const { secret = false } = opts;
  if (item.kind === 'img') {
    const url = buildFileFetchUrl(rctx, item.name, secret);
    return unsafe(html`
      <div class="scrap-preview scrap-preview--img" aria-hidden="true">
        <div class="scrap-preview--img-frame" style="background-image: url(&quot;${url}&quot;);"></div>
      </div>`);
  }
  if (item.kind !== 'md' && item.kind !== 'txt' && item.kind !== 'json') {
    return unsafe('');
  }
  try {
    const fullPath = scrapbookFilePathAtDir(
      rctx.scrapbookDir,
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

export function renderFilterChips(counts: KindCounts): RawHtml {
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

export function renderSearch(): RawHtml {
  return unsafe(html`
    <div class="scrap-search">
      <input type="search" placeholder="filter by name or content" aria-label="filter scrapbook" data-scrap-search />
      <span class="scrap-search-kbd">/</span>
    </div>`);
}

export function renderBreadcrumb(site: string, path: string): RawHtml {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? path;
  return unsafe(html`
    <nav class="scrap-breadcrumb" aria-label="hierarchy">
      <a href="/dev/content/${site}">${site}</a><span class="sep">›</span>
      <b>${last}</b>
    </nav>`);
}

export function renderAside(
  site: string,
  path: string,
  items: readonly ScrapbookItem[],
  totalSize: number,
  lastModified: string | null,
  secretCount: number,
  reviewLink: string | null,
): RawHtml {
  const lastModifiedLabel = lastModified ? formatRelativeTime(lastModified) : '—';
  const publicCount = items.length;
  const sizeLabel = formatSize(totalSize);
  const folderLabel = path.split('/').filter(Boolean).pop() ?? path;
  const fullPath = `${site}/${path}/scrapbook/`;
  // #168 Phase 34 ship-pass — when this scrapbook belongs to a tracked
  // calendar entry, expose a "← back to review" link so the operator
  // who arrived from the entry-review surface (or via the dashboard's
  // scrapbook chip) has an obvious path back. Pre-fix the only nav
  // affordance was the breadcrumb's site link, which lands on the
  // content tree, not the entry-review.
  const backLink: RawHtml = reviewLink !== null
    ? unsafe(html`<p class="scrap-aside-back"><a href="${reviewLink}">← back to review</a></p><hr />`)
    : unsafe('');
  return unsafe(html`
    <aside class="scrap-aside">
      ${backLink}
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

export function renderCard(
  rctx: RenderCtx,
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
  const preview = renderPreview(rctx, item, { secret });
  const kindMeta = computeKindMeta(rctx, item, { secret });
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
  // #164 Phase 34b — small ⚿ glyph next to .scrap-name on secret
  // cards. Provides visual continuity for the secret marker once a
  // card is expanded (where it grows outside the grouped section's
  // visual scope).
  const secretGlyph: RawHtml = secret
    ? unsafe(html`<span class="scrap-name-secret-mark" aria-label="secret" title="secret — never published">⚿</span>`)
    : unsafe('');
  return unsafe(html`
    <li class="scrap-card" data-kind="${item.kind}" data-state="closed" id="${id}"${unsafe(dataSecretAttr)}>
      <div class="scrap-card-head">
        <span class="scrap-seq">N° ${seq}</span>
        ${secretGlyph}
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
export function renderComposer(): RawHtml {
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

export function renderDropZone(): RawHtml {
  return unsafe(html`
    <div class="scrap-drop" role="button" tabindex="0" data-action="upload"
         aria-label="Drop a file here, or press Enter to pick one">
      ── drop a file here, or pick one ──
    </div>`);
}

export function renderSecretSection(
  rctx: RenderCtx,
  secretItems: readonly ScrapbookItem[],
): RawHtml {
  if (secretItems.length === 0) return unsafe('');
  const cards = secretItems.map((item, i) => renderCard(rctx, item, i, { secret: true }));
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
