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
  listScrapbook,
  type ScrapbookSummary,
} from '@deskwork/core/scrapbook';
import {
  resolveContentDir,
} from '@deskwork/core/paths';
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

function makeInlineTextLoaderForNode(
  ctx: StudioContext,
  site: string,
  slug: string,
): InlineTextLoader {
  const contentDir = resolveContentDir(ctx.projectRoot, ctx.config, site);
  const scrapbookDir = join(contentDir, slug, 'scrapbook');
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
): DetailRender {
  const contentDir = resolveContentDir(ctx.projectRoot, ctx.config, site);
  let frontmatter: Record<string, unknown> = {};
  let bodyPreview = '';
  let scrapbook: ScrapbookSummary | null = null;

  if (node.entry !== null) {
    const filePath = node.entry.filePath ?? `${node.slug}/index.md`;
    const abs = join(contentDir, filePath);
    const raw = safeReadFile(abs);
    if (raw !== null) {
      const parsed = parseFrontmatter(raw);
      frontmatter = parsed.data as Record<string, unknown>;
      bodyPreview = parsed.body;
    }
  } else if (node.hasFsDir && node.hasOwnIndex) {
    // Organizational node (#24, v0.6.0): no calendar entry, but the
    // fs walk found a directory with an index/README. Read that file
    // for the detail panel so the operator sees the structural prose
    // (e.g. "These are the characters in The Outbound") even though
    // nothing about this node ships through the lifecycle pipeline.
    const abs = findOrganizationalIndex(contentDir, node.slug);
    if (abs !== null) {
      const raw = safeReadFile(abs);
      if (raw !== null) {
        const parsed = parseFrontmatter(raw);
        frontmatter = parsed.data as Record<string, unknown>;
        bodyPreview = parsed.body;
      }
    }
  }

  try {
    scrapbook = listScrapbook(ctx.projectRoot, ctx.config, site, node.slug);
  } catch {
    scrapbook = null;
  }

  return { frontmatter, bodyPreview, scrapbook };
}

export async function renderNodeDetail(
  ctx: StudioContext,
  site: string,
  node: ContentNode,
): Promise<RawHtml> {
  const detail = loadDetailRender(ctx, site, node);
  const fmCount = Object.keys(detail.frontmatter).length;
  const reviewHref = `/dev/editorial-review/${encodeURI(node.slug)}?site=${site}`;
  const scrapHref = scrapbookViewerUrl({ site, path: node.slug });
  const scrapDirHint =
    node.scrapbookCount === 0
      ? '0 items · scrapbook empty'
      : `${node.scrapbookCount} items · /${node.slug}/scrapbook`;
  const updatedHint =
    node.scrapbookMostRecentMtime !== null
      ? html`<span class="detail__updated">last touched ${formatRelativeTime(node.scrapbookMostRecentMtime)}</span>`
      : '';
  const loader = makeInlineTextLoaderForNode(ctx, site, node.slug);
  const previewBlock = await renderBodyPreview(detail.bodyPreview);
  const reviewBtn =
    node.entry !== null
      ? html`<a class="btn btn--accent" href="${reviewHref}">Open in Review</a>`
      : '';

  return unsafe(html`
    <div class="detail" data-node-detail data-slug="${node.slug}">
      <div class="detail__crumb">${node.slug.replaceAll('/', ' · ')}</div>
      <h2 class="detail__title">${node.title}</h2>
      <p class="detail__sub">
        ${node.entry?.description ?? ''}
        ${unsafe(updatedHint)}
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
      ${renderScrapbookList(site, node.slug, detail.scrapbook, loader)}

      <div class="actions">
        ${unsafe(reviewBtn)}
        <a class="btn" href="${scrapHref}">Open Scrapbook</a>
      </div>
    </div>`);
}
