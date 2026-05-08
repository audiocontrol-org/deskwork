/**
 * Shared scrapbook-item renderer.
 *
 * Three studio surfaces consume this module:
 *
 *   1. Standalone scrapbook viewer  — `pages/scrapbook.ts`
 *   2. Review-page drawer (Phase 16c) — `pages/review.ts`
 *   3. Bird's-eye content view detail panel (Phase 16d) — `pages/content.ts`
 *
 * Goal: the operator sees consistent in-browser preview behavior wherever
 * a scrapbook item appears. The standalone viewer keeps its richer
 * disclosure / edit / rename / delete affordances; the read-only views
 * (review drawer, content-view detail panel) reuse the same kind chip,
 * filename, size, mtime, and the same in-browser preview rules:
 *
 *   - Image kinds (`png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`)
 *     render an inline thumbnail with a small overlay action to view
 *     full-size; clicking opens the served file in a new tab. Both
 *     image and PDF surfaces use a read-only binary endpoint
 *     (`GET /api/dev/scrapbook-file`) that the studio adds for these
 *     read-only views — distinct from the (not-yet-ported) full
 *     scrapbook CRUD API.
 *   - PDF — embedded via `<iframe>` using the same binary endpoint. The
 *     browser renders it natively.
 *   - Plain text / JSON — inline-truncated `<pre>` preview. Operators
 *     can read the first ~10 lines without leaving the page; a "view
 *     full" link opens the standalone viewer where the full file
 *     is mounted.
 *   - Markdown — kept as a kind-only row. Markdown is the editable
 *     surface — operators jump to the standalone viewer to edit. Showing
 *     a raw markdown preview here would either duplicate the editor or
 *     misrepresent what double-click does on this surface.
 *   - Anything else — kind chip + a download link. The browser can't
 *     render it, so make that explicit.
 *
 * Inline previews for text + JSON come from the server side: the
 * standalone viewer only loads body content on disclosure (lazy), but
 * the read-only renderers want the preview embedded at server-render
 * time so operators don't see a flash. Callers pass an
 * `inlinePreviewLoader` that knows how to read the first N bytes of
 * the file and return a string; this module composes the result into
 * the row HTML.
 */

import {
  formatRelativeTime,
  formatSize,
  type ScrapbookItem,
  type ScrapbookItemKind,
} from '@deskwork/core/scrapbook';
import { html, unsafe, type RawHtml } from '../pages/html.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Scrapbook items addressed by site + path. */
export interface ScrapbookAddress {
  site: string;
  /**
   * Hierarchical path of the scrapbook (e.g.
   * `the-outbound/characters/strivers`). Same string the standalone
   * viewer uses in its URL.
   */
  path: string;
  /**
   * Optional UUID of the calendar entry whose scrapbook this addresses.
   * When present, the standalone-viewer URL appends `?entryId=<uuid>` so
   * the server resolves the listing via `scrapbookDirForEntry` —
   * symmetric to the mutation API's entry-aware addressing (#191/#205).
   *
   * Falls back to slug-template addressing when absent (legacy callers
   * and ad-hoc / organizational paths that aren't tracked entries).
   */
  entryId?: string;
}

/**
 * Read the first slice of a text/JSON scrapbook file for inline
 * preview. Implementations must read at most `maxBytes` to keep the
 * server render cheap. Returns `null` when the file isn't readable
 * as text (the renderer falls back to a download link in that case).
 */
export type InlineTextLoader = (
  filename: string,
  maxBytes: number,
) => string | null;

export interface ScrapbookItemRendererOptions {
  /**
   * Maximum bytes to read for inline text/JSON preview. Defaults to
   * 800 — small enough to keep the row tight, large enough for the
   * operator to recognize the file's shape.
   */
  inlinePreviewMaxBytes?: number;
  /**
   * Optional loader used by text/JSON kinds. Required if the caller
   * wants those kinds to actually preview inline; without a loader
   * they fall back to a kind-chip-only row.
   */
  inlinePreviewLoader?: InlineTextLoader;
}

const DEFAULT_PREVIEW_BYTES = 800;
const TEXT_PREVIEW_LINES = 8;

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Build the URL to fetch a scrapbook file's raw bytes from the
 * read-only binary endpoint. The endpoint is read-only by design —
 * Phase 16's image / PDF previews need a stable URL, but full
 * scrapbook CRUD remains in the standalone viewer's surface.
 *
 * When `address.entryId` is present, sends `entryId=<uuid>` so the
 * server resolves via the entry's sidecar (entry-aware addressing —
 * #205, symmetric to the mutation API). Slug-template addressing
 * (`path=`) is the fallback when no entry id is available.
 */
export function scrapbookFileUrl(
  address: ScrapbookAddress,
  filename: string,
  opts: { secret?: boolean } = {},
): string {
  const params = new URLSearchParams({
    site: address.site,
    name: filename,
  });
  if (address.entryId !== undefined && address.entryId.length > 0) {
    params.set('entryId', address.entryId);
  } else {
    params.set('path', address.path);
  }
  if (opts.secret) params.set('secret', '1');
  return `/api/dev/scrapbook-file?${params.toString()}`;
}

/**
 * Build the URL to the standalone scrapbook viewer for an address —
 * the operator's "open scrapbook" jumping-off point.
 *
 * When `address.entryId` is present, appends `?entryId=<uuid>` so the
 * server route resolves the listing via `scrapbookDirForEntry`
 * (entry-aware addressing — #205). Slug-only fallback is preserved
 * when no entry id is available.
 */
export function scrapbookViewerUrl(address: ScrapbookAddress): string {
  // The path is already kebab-case + slash-separated; encodeURI keeps
  // the slashes literal while escaping anything else (defensive).
  const base = `/dev/scrapbook/${address.site}/${encodeURI(address.path)}`;
  if (address.entryId !== undefined && address.entryId.length > 0) {
    return `${base}?entryId=${encodeURIComponent(address.entryId)}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Per-kind preview detection
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
]);

const PDF_EXTENSIONS = new Set(['.pdf']);

function lowerExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

function isImageFilename(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(lowerExt(filename));
}

function isPdfFilename(filename: string): boolean {
  return PDF_EXTENSIONS.has(lowerExt(filename));
}

function kindLabel(kind: ScrapbookItemKind): string {
  return kind === 'other' ? '·' : kind.toUpperCase();
}

// ---------------------------------------------------------------------------
// Inline preview helpers
// ---------------------------------------------------------------------------

function truncateForInline(raw: string, lines: number): string {
  const split = raw.split('\n').slice(0, lines);
  // Append an ellipsis line when truncation actually happened. The
  // visual fade-out gradient handles the polish; the ellipsis line
  // makes the truncation explicit even with CSS off.
  const truncated = raw.split('\n').length > lines || raw.length > 1024;
  return truncated ? `${split.join('\n')}\n…` : split.join('\n');
}

function loadInlineText(
  filename: string,
  options: ScrapbookItemRendererOptions,
): string | null {
  const loader = options.inlinePreviewLoader;
  if (!loader) return null;
  const max = options.inlinePreviewMaxBytes ?? DEFAULT_PREVIEW_BYTES;
  const raw = loader(filename, max);
  if (raw === null) return null;
  return truncateForInline(raw, TEXT_PREVIEW_LINES);
}

// ---------------------------------------------------------------------------
// Read-only row renderer
// ---------------------------------------------------------------------------

/**
 * Render a single scrapbook item as a read-only row for the review
 * drawer or the content-view detail panel. Returns the row HTML wrapped
 * in `unsafe(...)`.
 *
 * Visual posture: kind chip + filename + size + mtime, with an inline
 * preview block beneath the row for kinds the browser can render in
 * place (image thumbnail, text/JSON truncated, PDF embed). Markdown +
 * unrenderable kinds keep a single-line row.
 */
export function renderReadOnlyScrapbookRow(
  address: ScrapbookAddress,
  item: ScrapbookItem,
  opts: ScrapbookItemRendererOptions = {},
): RawHtml {
  const fileUrl = scrapbookFileUrl(address, item.name);
  const sizeText = formatSize(item.size);
  const mtimeText = formatRelativeTime(item.mtime);

  if (isImageFilename(item.name)) {
    return unsafe(html`
      <div class="scrap scrap--img" data-kind="img" data-filename="${item.name}">
        <a class="scrap__thumb-link" href="${fileUrl}" target="_blank" rel="noopener"
          aria-label="Open ${item.name} in a new tab">
          <img class="scrap__thumb" loading="lazy" alt="" src="${fileUrl}">
        </a>
        <span class="scrap__name">${item.name}</span>
        <span class="scrap__size">${sizeText}</span>
        <span class="scrap__mtime">${mtimeText}</span>
      </div>`);
  }

  if (isPdfFilename(item.name)) {
    return unsafe(html`
      <div class="scrap scrap--pdf" data-kind="pdf" data-filename="${item.name}">
        <span class="scrap__kind">PDF</span>
        <span class="scrap__name">
          <a class="scrap__name-link" href="${fileUrl}" target="_blank" rel="noopener">${item.name}</a>
        </span>
        <span class="scrap__size">${sizeText}</span>
        <span class="scrap__mtime">${mtimeText}</span>
        <iframe class="scrap__pdf-frame" src="${fileUrl}#view=FitH" title="${item.name}"
          aria-label="PDF preview of ${item.name}"></iframe>
      </div>`);
  }

  if (item.kind === 'txt' || item.kind === 'json') {
    const inline = loadInlineText(item.name, opts);
    if (inline !== null) {
      return unsafe(html`
        <div class="scrap scrap--with-preview" data-kind="${item.kind}" data-filename="${item.name}">
          <span class="scrap__kind">${kindLabel(item.kind)}</span>
          <span class="scrap__name">
            <a class="scrap__name-link" href="${fileUrl}" target="_blank" rel="noopener">${item.name}</a>
          </span>
          <span class="scrap__size">${sizeText}</span>
          <span class="scrap__mtime">${mtimeText}</span>
          <pre class="scrap__inline-preview">${inline}</pre>
        </div>`);
    }
    // No loader provided — fall through to the single-line row.
  }

  // Default row — kind chip + filename + size + mtime. Markdown lands
  // here so operators jump to the standalone viewer to edit.
  const linkAttr = item.kind === 'md' ? '' : ' target="_blank" rel="noopener"';
  const href = item.kind === 'md' ? scrapbookViewerUrl(address) : fileUrl;
  return unsafe(html`
    <div class="scrap" data-kind="${item.kind}" data-filename="${item.name}">
      <span class="scrap__kind">${kindLabel(item.kind)}</span>
      <span class="scrap__name">
        <a class="scrap__name-link" href="${href}"${unsafe(linkAttr)}>${item.name}</a>
      </span>
      <span class="scrap__size">${sizeText}</span>
      <span class="scrap__mtime">${mtimeText}</span>
    </div>`);
}

/**
 * Render an empty-state row for a scrapbook drawer / panel that has
 * no items. Shown faded so the operator still sees the section exists
 * for this node.
 *
 * Issue 6 — the empty state now invites action: it points the operator
 * at the scrapbook viewer for THIS node so they can drop research notes
 * directly. When `address` is supplied (drawer + content-detail
 * callsites both have one in scope), the link resolves to the per-entry
 * viewer URL `/dev/scrapbook/<site>/<slug>`. With no address, we fall
 * back to the scrapbook index `/dev/scrapbook/` — used only by callers
 * that haven't been threaded site/slug yet.
 */
export function renderEmptyScrapbookRow(
  address?: ScrapbookAddress,
): RawHtml {
  const href = address ? scrapbookViewerUrl(address) : '/dev/scrapbook/';
  return unsafe(html`
    <div class="scrap scrap--empty" data-state="empty">
      <span class="scrap__empty-text">No items yet. <a class="scrap__empty-link" href="${href}">Drop research notes →</a></span>
    </div>`);
}
