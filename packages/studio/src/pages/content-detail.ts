/**
 * Detail panel for the bird's-eye content view (Phase 16d).
 *
 * Shows frontmatter, body preview, and scrapbook listing for a single
 * tree node. Used as the right-hand panel of the drilldown view; also
 * has an "empty placeholder" variant when no node is selected.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatRelativeTime,
  listScrapbookAtDir,
  scrapbookDirAtPath,
  scrapbookDirForEntry,
  type ScrapbookSummary,
} from '@deskwork/core/scrapbook';
import {
  resolveContentDir,
} from '@deskwork/core/paths';
import type { ContentIndex } from '@deskwork/core/content-index';
import { parseFrontmatter } from '@deskwork/core/frontmatter';
import { renderMarkdownToHtml } from '@deskwork/core/review/render';
import type { StudioContext } from '../routes/api.ts';
import type { ContentNode } from '@deskwork/core/content-tree';
import { html, unsafe, type RawHtml } from './html.ts';
import {
  renderEmptyScrapbookRow,
  renderReadOnlyScrapbookRow,
  scrapbookViewerUrl,
  type InlineTextLoader,
} from '../components/scrapbook-item.ts';

const PREVIEW_CHAR_BUDGET = 480;

export function renderEmptyDetail(): RawHtml {
  return unsafe(html`
    <div class="detail detail--empty" data-detail-empty>
      <div class="ornament" aria-hidden="true">· · ·</div>
      <p class="text">
        Select a node to read its head matter, preview its body, and
        browse its scrapbook.
      </p>
    </div>`);
}

function safeReadFile(absPath: string): string | null {
  try {
    if (!existsSync(absPath)) return null;
    return readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
}

function fmField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(fmField).join(', ');
  return JSON.stringify(value);
}

function renderFrontmatter(fm: Record<string, unknown>): RawHtml {
  const keys = Object.keys(fm);
  if (keys.length === 0) {
    return unsafe(html`<p class="frontmatter-empty">No frontmatter detected.</p>`);
  }
  const rows = keys.map(
    (k) => html`<dt>${k}</dt><dd>${fmField(fm[k])}</dd>`,
  );
  return unsafe(html`
    <dl class="frontmatter">
      ${unsafe(rows.join(''))}
    </dl>`);
}

async function renderBodyPreview(body: string): Promise<RawHtml> {
  if (body.trim().length === 0) {
    return unsafe(html`<p class="preview-empty">No body content yet.</p>`);
  }
  const slice =
    body.length > PREVIEW_CHAR_BUDGET * 2
      ? `${body.slice(0, PREVIEW_CHAR_BUDGET * 2)}\n\n…`
      : body;
  const rendered = await renderMarkdownToHtml(slice);
  return unsafe(html`<div class="preview">${unsafe(rendered)}</div>`);
}

/**
 * Resolve the on-disk scrapbook directory for a content tree node.
 *
 * Precedence — the index-driven path is preferred so writingcontrol-
 * shape entries (slug != fs path) read scrapbook items from the actual
 * file location:
 *
 *   1. The node carries a calendar entry with a stable `id` AND a
 *      per-request content index is wired → resolve via
 *      `scrapbookDirForEntry`.
 *   2. Otherwise → resolve via `scrapbookDirAtPath` against the node's
 *      fs-derived `path`. Works for both organizational nodes (no
 *      entry) and pre-doctor entries (no id binding yet) since
 *      `node.path` is always the structural key already validated by
 *      the content-tree builder.
 *
 * The shared scrapbook directory lookup avoids duplicating the
 * fall-through logic between the inline-text loader and the scrapbook
 * listing in `loadDetailRender`.
 */
function resolveNodeScrapbookDir(
  ctx: StudioContext,
  site: string,
  node: ContentNode,
  index?: ContentIndex,
): string {
  if (node.entry !== null && node.entry.id !== undefined && node.entry.id !== '') {
    return scrapbookDirForEntry(
      ctx.projectRoot,
      ctx.config,
      site,
      node.entry,
      index,
    );
  }
  // node.path is always a valid kebab-case path (the content-tree
  // builder enforces this); scrapbookDirAtPath accepts that shape.
  // Used directly because the path is already filesystem-derived —
  // bypassing the slug template that wouldn't resolve correctly for
  // hierarchical / relocated entries.
  return scrapbookDirAtPath(ctx.projectRoot, ctx.config, site, node.path);
}

function makeInlineTextLoaderForNode(
  ctx: StudioContext,
  site: string,
  node: ContentNode,
  index?: ContentIndex,
): InlineTextLoader {
  let scrapbookDir: string;
  try {
    scrapbookDir = resolveNodeScrapbookDir(ctx, site, node, index);
  } catch {
    // Defensive: a malformed path or unresolvable entry shouldn't blow
    // up the detail panel. Fall back to the legacy slug-template
    // computation — the loader will just return null for every read.
    const contentDir = resolveContentDir(ctx.projectRoot, ctx.config, site);
    scrapbookDir = join(contentDir, node.path, 'scrapbook');
  }
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

function renderScrapbookList(
  site: string,
  slug: string,
  summary: ScrapbookSummary | null,
  loader: InlineTextLoader,
): RawHtml {
  if (!summary || (summary.items.length === 0 && summary.secretItems.length === 0)) {
    return renderEmptyScrapbookRow();
  }
  const itemRows = summary.items.map((item) =>
    renderReadOnlyScrapbookRow({ site, path: slug }, item, {
      inlinePreviewLoader: loader,
    }),
  );
  const secretRows = summary.secretItems.map((item) =>
    renderReadOnlyScrapbookRow({ site, path: slug }, item, {
      inlinePreviewLoader: loader,
    }),
  );
  if (secretRows.length === 0) {
    return unsafe(html`<div class="scraplist">${itemRows}</div>`);
  }
  return unsafe(html`
    <div class="scraplist">${itemRows}</div>
    <p class="scraplist-secret-head">
      <span aria-hidden="true">⚿</span> secret · ${summary.secretItems.length}
    </p>
    <div class="scraplist scraplist--secret">${secretRows}</div>`);
}

interface DetailRender {
  frontmatter: Record<string, unknown>;
  bodyPreview: string;
  scrapbook: ScrapbookSummary | null;
}

/**
 * Find the on-disk markdown for an organizational node — try
 * `<slug>/index.md`, then `<slug>/README.md` (and `.mdx`/`.markdown`
 * variants). Used when the node has no calendar entry but the
 * filesystem walk found a directory with a recognizable index file
 * (#24, v0.6.0). Returns the first match, or null.
 */
function findOrganizationalIndex(
  contentDir: string,
  slug: string,
): string | null {
  const candidates = [
    'index.md', 'index.mdx', 'index.markdown',
    'README.md', 'README.mdx', 'README.markdown',
  ];
  for (const name of candidates) {
    const abs = join(contentDir, slug, name);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function loadDetailRender(
  ctx: StudioContext,
  site: string,
  node: ContentNode,
  index?: ContentIndex,
): DetailRender {
  const contentDir = resolveContentDir(ctx.projectRoot, ctx.config, site);
  let frontmatter: Record<string, unknown> = {};
  let bodyPreview = '';
  let scrapbook: ScrapbookSummary | null = null;

  // Issue #103 fix: prefer the id-bound on-disk file when one is
  // attached to the node (set by content-tree.ts via `idBoundFile`).
  // This is the canonical resolution for tracked entries — it handles
  // single-file entries (e.g. `prd.md` next to peer files) where
  // `node.path` is a slug rather than a directory, and host templates
  // that put the file outside the `<path>/index.md` shape. Falls back
  // to the directory-index lookup for purely organizational nodes
  // (#24, v0.6.0) whose canonical content is a README/index.md.
  const targetFile =
    node.filePath !== undefined
      ? node.filePath
      : findOrganizationalIndex(contentDir, node.path);
  if (targetFile !== null) {
    const raw = safeReadFile(targetFile);
    if (raw !== null) {
      const parsed = parseFrontmatter(raw);
      frontmatter = parsed.data as Record<string, unknown>;
      bodyPreview = parsed.body;
    }
  }

  try {
    // Phase 19c+: the scrapbook listing prefers the index-driven dir
    // for tracked entries (id binding) and falls back to the path-
    // driven dir for organizational nodes. `scrapbookDirAtPath` is the
    // right primitive here because `node.path` is already filesystem-
    // derived — no slug template to substitute.
    const scrapDir = resolveNodeScrapbookDir(ctx, site, node, index);
    scrapbook = listScrapbookAtDir(site, node.path, scrapDir);
  } catch {
    scrapbook = null;
  }

  return { frontmatter, bodyPreview, scrapbook };
}

export async function renderNodeDetail(
  ctx: StudioContext,
  site: string,
  node: ContentNode,
  index?: ContentIndex,
): Promise<RawHtml> {
  const detail = loadDetailRender(ctx, site, node, index);
  const fmCount = Object.keys(detail.frontmatter).length;
  // Phase 19d: prefer the entry's stable id for the canonical review
  // URL — refactor-proof, survives slug renames. Falls back to the
  // entry slug (or the node's path) when the entry has no id stamped.
  const reviewKey =
    node.entry !== null && node.entry.id !== undefined && node.entry.id !== ''
      ? node.entry.id
      : (node.slug ?? node.path);
  const reviewHref = `/dev/editorial-review/${encodeURI(reviewKey)}?site=${site}`;
  // Scrapbook viewer addresses by fs path — every node has a
  // deterministic on-disk scrapbook location at `<path>/scrapbook/`.
  const scrapHref = scrapbookViewerUrl({ site, path: node.path });
  const scrapDirHint =
    node.scrapbookCount === 0
      ? '0 items · scrapbook empty'
      : `${node.scrapbookCount} items · /${node.path}/scrapbook`;
  const updatedHint =
    node.scrapbookMostRecentMtime !== null
      ? html`<span class="detail__updated">last touched ${formatRelativeTime(node.scrapbookMostRecentMtime)}</span>`
      : '';
  const loader = makeInlineTextLoaderForNode(ctx, site, node, index);
  const previewBlock = await renderBodyPreview(detail.bodyPreview);
  const reviewBtn =
    node.entry !== null
      ? html`<a class="btn btn--accent" href="${reviewHref}">Open in Review</a>`
      : '';
  // Phase 19c: when an entry overlay carries a slug, surface it as
  // the "public URL" hover hint. The slug is the host-rendering
  // engine's identifier — operators recognize it as the SEO URL,
  // distinct from the fs path that drives the tree.
  const publicUrlHint =
    node.slug !== undefined && node.slug !== node.path
      ? html`<span class="detail__public-url" title="public URL on the host site">
          public URL: /blog/${node.slug}
        </span>`
      : '';

  return unsafe(html`
    <div class="detail" data-node-detail data-slug="${node.path}">
      <div class="detail__crumb">${node.path.replaceAll('/', ' · ')}</div>
      <h2 class="detail__title">${node.title}</h2>
      <p class="detail__sub">
        ${node.entry?.description ?? ''}
        ${unsafe(updatedHint)}
        ${unsafe(publicUrlHint)}
      </p>

      <div class="detail__sectionhead">
        Frontmatter
        <span class="marg">${fmCount} ${fmCount === 1 ? 'field' : 'fields'} · raw</span>
      </div>
      ${renderFrontmatter(detail.frontmatter)}

      <div class="detail__sectionhead">
        Preview
        <span class="marg">first paragraphs · markdown rendered</span>
      </div>
      ${previewBlock}

      <div class="detail__sectionhead">
        Scrapbook
        <span class="marg">${scrapDirHint}</span>
      </div>
      ${renderScrapbookList(site, node.path, detail.scrapbook, loader)}

      <div class="actions">
        ${unsafe(reviewBtn)}
        <a class="btn" href="${scrapHref}">Open Scrapbook</a>
      </div>
    </div>`);
}
