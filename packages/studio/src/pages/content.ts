/**
 * Bird's-eye content view (Phase 16d).
 *
 * Three render entry points sharing a Writer's-Catalog visual language
 * extracted from `mockups/birds-eye-content-view.html`:
 *
 *   - `renderContentTopLevel(ctx)` — `/dev/content` and `/dev/content/:site`
 *     → site cards + per-site project rollups.
 *   - `renderContentProject(ctx, site, project, selectedSlug)` —
 *     `/dev/content/:site/:project{.+}` → drilldown view with the
 *     per-project tree on the left and the detail panel on the right.
 *   - The detail panel is selected via the `?node=<slug>` query
 *     param. When absent, an empty placeholder renders.
 *
 * Read-only — no calendar mutations. Operators jump back to the
 * standalone scrapbook viewer or the longform review surface for
 * mutations via the inline `→ review` and `→ scrapbook` affordances
 * on each tree row.
 *
 * Helpers:
 *   - `pages/content-detail.ts` — detail panel rendering.
 *   - `pages/chrome.ts` — cross-page editorial folio strip (`renderEditorialFolio`).
 *   - `components/scrapbook-item.ts` — shared scrap-row renderer.
 *   - `@deskwork/core/content-tree` — pure tree assembly.
 */

import { readCalendar } from '@deskwork/core/calendar';
import {
  buildContentTree,
  findNode,
  flattenForRender,
  type ContentNode,
  type ContentProject,
  type FlatNode,
} from '@deskwork/core/content-tree';
import type { ContentIndex } from '@deskwork/core/content-index';
import {
  formatRelativeTime,
} from '@deskwork/core/scrapbook';
import { resolveCalendarPath } from '@deskwork/core/paths';
import type { Stage } from '@deskwork/core/types';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';
import { renderEmptyDetail, renderNodeDetail } from './content-detail.ts';
import { scrapbookViewerUrl } from '../components/scrapbook-item.ts';

/**
 * Per-request index getter — supplied by the route layer (which
 * pulls memoized indices off the Hono context). Optional: when
 * omitted, renderers fall back to building the index per call.
 */
export type IndexGetter = (site: string) => ContentIndex;

// ---------------------------------------------------------------------------
// Per-site project loading
// ---------------------------------------------------------------------------

interface SiteProjects {
  site: string;
  host: string;
  projects: ContentProject[];
}

function loadProjectsForSite(
  ctx: StudioContext,
  site: string,
  getIndex?: IndexGetter,
): SiteProjects {
  const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
  const cal = readCalendar(calendarPath);
  const contentIndex = getIndex ? getIndex(site) : undefined;
  const projects = buildContentTree(
    site,
    cal.entries,
    ctx.config,
    ctx.projectRoot,
    contentIndex !== undefined ? { contentIndex } : {},
  );
  return {
    site,
    host: ctx.config.sites[site].host,
    projects,
  };
}

function loadAllSites(
  ctx: StudioContext,
  getIndex?: IndexGetter,
): SiteProjects[] {
  return Object.keys(ctx.config.sites).map((site) =>
    loadProjectsForSite(ctx, site, getIndex),
  );
}

interface AggregateCounts {
  sites: number;
  trackedNodes: number;
  scrapbookItems: number;
}

function aggregateCounts(siteProjects: readonly SiteProjects[]): AggregateCounts {
  let trackedNodes = 0;
  let scrapbookItems = 0;
  for (const sp of siteProjects) {
    for (const project of sp.projects) {
      trackedNodes += project.trackedCount;
      scrapbookItems += project.scrapbookCount;
    }
  }
  return { sites: siteProjects.length, trackedNodes, scrapbookItems };
}

// ---------------------------------------------------------------------------
// Lane styling helpers
// ---------------------------------------------------------------------------

function laneToken(stage: Stage | null): string {
  return stage ? stage.toLowerCase() : 'unknown';
}

function laneLabel(stage: Stage | null): string {
  return stage ? `mostly ${stage.toLowerCase()}` : 'untracked';
}

// ---------------------------------------------------------------------------
// Top-level: site cards + project rows
// ---------------------------------------------------------------------------

function projectFormHint(project: ContentProject): string {
  if (project.totalNodes === 1) return 'flat entry';
  if (project.maxDepth >= 3) return `nested · ${project.totalNodes} nodes`;
  return `collection · ${project.totalNodes} nodes`;
}

function renderProjectRow(
  site: string,
  project: ContentProject,
  index: number,
): RawHtml {
  const num = String(index + 1).padStart(2, '0');
  const lane = laneToken(project.predominantLane);
  const href = `/dev/content/${site}/${encodeURI(project.rootSlug)}`;
  return unsafe(html`
    <a class="project-row" href="${href}">
      <span class="project-row__num">${num}</span>
      <span class="project-row__name">
        ${project.title}
        <em>${projectFormHint(project)}</em>
      </span>
      <span class="project-row__nodes">${project.totalNodes} nodes</span>
      <span class="project-row__lane">
        <span class="lane-dot lane-dot--${lane}"></span>
        ${laneLabel(project.predominantLane)}
      </span>
    </a>`);
}

function siteTag(index: number): string {
  return index === 0 ? 'Site · primary' : 'Site · auxiliary';
}

function renderSiteCard(sp: SiteProjects, index: number): RawHtml {
  const totalNodes = sp.projects.reduce((acc, p) => acc + p.totalNodes, 0);
  const trackedNodes = sp.projects.reduce(
    (acc, p) => acc + p.trackedCount,
    0,
  );
  const scrapbookItems = sp.projects.reduce(
    (acc, p) => acc + p.scrapbookCount,
    0,
  );
  return unsafe(html`
    <article class="site-card">
      <div class="site-card__tag">${siteTag(index)}</div>
      <h2 class="site-card__name">${sp.site}</h2>
      <div class="site-card__host">${sp.host}</div>
      <div class="site-card__counts">
        <b>${sp.projects.length}</b> root entries ·
        <b>${totalNodes}</b> total nodes ·
        <b>${scrapbookItems}</b> scrapbook items
      </div>
      <div class="site-card__projects">
        ${sp.projects.map((p, i) => renderProjectRow(sp.site, p, i))}
      </div>
      ${
        sp.projects.length === 0
          ? unsafe(html`
              <p class="site-card__empty">No tracked content yet — run
                <code>/deskwork:add</code> or
                <code>/deskwork:ingest</code>.
              </p>`)
          : ''
      }
      <p class="site-card__rollup">
        ${trackedNodes} tracked · ${totalNodes - trackedNodes} synthetic
      </p>
    </article>`);
}

export function renderContentTopLevel(
  ctx: StudioContext,
  getIndex?: IndexGetter,
): string {
  const sites = loadAllSites(ctx, getIndex);
  const counts = aggregateCounts(sites);

  const body = html`
    ${renderEditorialFolio('content', 'the shape of the work')}
    <main class="content-page">
      <header class="er-pagehead er-pagehead--split er-pagehead--compact">
        <div>
          <h1 class="er-pagehead__title">A <em>shape</em> of the work.</h1>
          <p class="er-pagehead__deck">
            The pipeline view shows where things are. This shows what's
            there. Browse the corpus by its tree on disk; drill into any
            node to see its content and the scrapbook hanging off it.
          </p>
        </div>
        <p class="er-pagehead__meta">
          <span><b>${counts.sites}</b> SITES</span>
          <span><b>${counts.trackedNodes}</b> TRACKED NODES</span>
          <span><b>${counts.scrapbookItems}</b> SCRAPBOOK ITEMS</span>
        </p>
      </header>
      <section class="toplevel">
        ${sites.map((sp, i) => renderSiteCard(sp, i))}
      </section>
    </main>`;

  return layout({
    title: 'Content — deskwork',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/content.css',
      '/static/css/scrap-row.css',
      '/static/css/blog-figure.css',
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    // #29: lightbox listener for image thumbnails in detail-panel
    // scrap rows. Idempotent — safe to load on the top-level page
    // too (no scrap rows there → no work).
    scriptModules: ['/static/dist/content-view-client.js'],
  });
}

// ---------------------------------------------------------------------------
// Drilldown view: tree + detail panel
// ---------------------------------------------------------------------------

function renderTreeBreadcrumb(
  site: string,
  project: ContentProject,
  selectedPath: string | null,
): RawHtml {
  const links: string[] = [];
  links.push(html`<a href="/dev/content/${site}">${site}</a>`);
  if (selectedPath === null) {
    links.push(html`<b>${project.rootSlug}</b>`);
  } else {
    const projectHref = `/dev/content/${site}/${encodeURI(project.rootSlug)}`;
    links.push(html`<a href="${projectHref}">${project.rootSlug}</a>`);
    const segments = selectedPath.split('/');
    for (let i = 1; i < segments.length; i++) {
      const path = segments.slice(0, i + 1).join('/');
      const isLast = i === segments.length - 1;
      if (isLast) {
        links.push(html`<b>${segments[i]}</b>`);
      } else {
        const href = `${projectHref}?node=${encodeURIComponent(path)}`;
        links.push(html`<a href="${href}">${segments[i]}</a>`);
      }
    }
  }
  const sep = html`<span class="breadcrumb__sep" aria-hidden="true">›</span>`;
  return unsafe(html`
    <nav class="breadcrumb" aria-label="content tree breadcrumb">
      ${unsafe(links.join(`\n${sep}\n`))}
    </nav>`);
}

function nodeIcon(node: ContentNode): RawHtml {
  if (node.children.length > 0 || node.lane === null) {
    return unsafe(
      html`<span class="tree-row__icon is-branch" aria-hidden="true">◐</span>`,
    );
  }
  return unsafe(html`<span class="tree-row__icon" aria-hidden="true">·</span>`);
}

function nodeFilePathHint(node: ContentNode): string {
  // Phase 19c: node.path is the fs-relative path (the structural key).
  // Tracked entries display the index file shape; organizational
  // nodes show the directory shape. The host's actual file basename
  // could differ (README.md, .mdx, etc.) but `/index.md` is the
  // universal "expected location" hint the operator reads.
  if (node.entry !== null) return `/${node.path}/index.md`;
  return `/${node.path}/`;
}

/**
 * Last segment of an fs-relative path. Used to detect when a tracked
 * entry's public-URL slug differs from where it lives on disk —
 * e.g. an entry whose `path = "projects/the-outbound-novel"` and
 * `slug = "the-outbound"` (renamed directory, slug unchanged for SEO).
 */
function pathLeaf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}

function renderTreeRowMeta(node: ContentNode): RawHtml {
  const meta: string[] = [];
  if (node.scrapbookCount > 0) {
    const word = node.scrapbookCount === 1 ? 'note' : 'notes';
    meta.push(html`<span class="scrap-count">${node.scrapbookCount} ${word}</span>`);
  }
  if (node.scrapbookMostRecentMtime !== null) {
    meta.push(html`<span class="mtime">${formatRelativeTime(node.scrapbookMostRecentMtime)}</span>`);
  }
  return unsafe(meta.join(''));
}

function renderTreeRowActions(node: ContentNode, site: string): RawHtml {
  // Phase 19d: when an entry is overlaid, prefer its stable id for
  // the canonical review URL (refactor-proof — survives slug renames).
  // Fall back to the entry's slug (or the node's path for organizational
  // nodes) when no id is stamped — that's the legacy migration shape;
  // server.ts 302-redirects it to the canonical URL.
  const reviewKey =
    node.entry !== null && node.entry.id !== undefined && node.entry.id !== ''
      ? node.entry.id
      : (node.slug ?? node.path);
  const reviewHref = `/dev/editorial-review/${encodeURI(reviewKey)}?site=${site}`;
  // Scrapbook addressing uses fs path — every node, tracked or not,
  // has a deterministic on-disk scrapbook location at `<path>/scrapbook/`.
  const scrapHref = scrapbookViewerUrl({ site, path: node.path });
  const reviewLink =
    node.entry !== null
      ? html`<a class="tree-row__action tree-row__action--review" href="${reviewHref}"
          tabindex="0" aria-label="Open review for ${node.title}">→ review</a>`
      : '';
  const scrapLink =
    node.scrapbookCount > 0
      ? html`<a class="tree-row__action" href="${scrapHref}"
          tabindex="0" aria-label="Open scrapbook for ${node.title}">→ scrapbook</a>`
      : '';
  return unsafe(reviewLink + scrapLink);
}

function renderTreeRow(
  site: string,
  project: ContentProject,
  flat: FlatNode,
  selectedPath: string | null,
): RawHtml {
  const { node, depth, isLast } = flat;
  const isSelected = selectedPath === node.path;
  const isLeaf = node.children.length === 0;
  const lane = laneToken(node.lane);
  const projectHref = `/dev/content/${site}/${encodeURI(project.rootSlug)}`;
  // Phase 19c: structural URLs key on fs path. The selection query
  // parameter accepts hierarchical paths via `:path{.+}` route syntax
  // upstream — encodeURIComponent preserves the `/` segments.
  const nodeHref = `${projectHref}?node=${encodeURIComponent(node.path)}`;
  const classes = [
    'tree-row',
    isLeaf ? 'is-leaf' : 'is-branch',
    isLast ? 'is-last' : '',
    isSelected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Phase 19d: render a "public URL" hover hint when an overlay entry
  // exists AND the entry's slug differs from the path's leaf segment.
  // The slug is the host-rendering engine's identifier (the SEO URL);
  // showing it explicitly clarifies the relationship between the
  // structural fs path and the public-facing URL.
  const publicUrlHint =
    node.slug !== undefined && node.slug !== pathLeaf(node.path)
      ? unsafe(html`<span class="tree-row__public-url"
          title="public URL on the host site">/blog/${node.slug}</span>`)
      : unsafe('');

  // The HTML attribute name `data-slug` is preserved for backward
  // compatibility with the client-side selectors; it now carries the
  // fs path. A future cleanup can rename the attribute to data-path.
  return unsafe(html`
    <a class="${classes}" href="${nodeHref}" style="--depth: ${depth}"
      data-slug="${node.path}" aria-current="${isSelected ? 'true' : 'false'}">
      <div class="tree-row__main">
        ${nodeIcon(node)}
        <span class="tree-row__title">${node.title}</span>
        <span class="tree-row__slug">${nodeFilePathHint(node)}</span>
        ${publicUrlHint}
      </div>
      <span class="tree-row__lane">
        <span class="lane-dot lane-dot--${lane}"></span>
        ${node.lane ? node.lane.toLowerCase() : 'untracked'}
      </span>
      <span class="tree-row__meta">${renderTreeRowMeta(node)}</span>
      <span class="tree-row__actions">${renderTreeRowActions(node, site)}</span>
    </a>`);
}

function renderTree(
  site: string,
  project: ContentProject,
  selectedPath: string | null,
): RawHtml {
  const flat = flattenForRender(project.root);
  return unsafe(html`
    <div class="tree" role="tree">
      ${flat.map((f) => renderTreeRow(site, project, f, selectedPath))}
    </div>`);
}

// ---------------------------------------------------------------------------
// Project drilldown render entry
// ---------------------------------------------------------------------------

export async function renderContentProject(
  ctx: StudioContext,
  site: string,
  projectSlug: string,
  selectedPath: string | null,
  getIndex?: IndexGetter,
): Promise<{ status: number; html: string }> {
  if (!(site in ctx.config.sites)) {
    return { status: 404, html: renderNotFound(`unknown site: ${site}`) };
  }
  const sp = loadProjectsForSite(ctx, site, getIndex);
  const project = sp.projects.find((p) => p.rootSlug === projectSlug);
  if (!project) {
    return {
      status: 404,
      html: renderNotFound(`unknown project: ${projectSlug} on ${site}`),
    };
  }

  const selectedNode = selectedPath ? findNode(project, selectedPath) : null;
  const detailBlock = selectedNode
    ? await renderNodeDetail(ctx, site, selectedNode)
    : renderEmptyDetail();

  const body = html`
    ${renderEditorialFolio('content', `drilldown · ${project.rootSlug}`)}
    <main class="content-page">
      <section class="drilldown">
        <div class="drilldown__tree">
          ${renderTreeBreadcrumb(site, project, selectedNode?.path ?? null)}
          <header class="tree-head">
            <h2 class="tree-head__title">${project.title}</h2>
            <span class="tree-head__count">
              ${project.totalNodes} NODES · ${project.maxDepth} LEVELS DEEP
            </span>
          </header>
          ${renderTree(site, project, selectedNode?.path ?? null)}
        </div>
        ${detailBlock}
      </section>
    </main>`;

  return {
    status: 200,
    html: layout({
      title: `${project.title} · content — deskwork`,
      cssHrefs: [
        '/static/css/editorial-review.css',
        '/static/css/editorial-nav.css',
        '/static/css/content.css',
        '/static/css/scrap-row.css',
        '/static/css/blog-figure.css',
      ],
      bodyAttrs: 'data-review-ui="studio"',
      bodyHtml: body,
      // #29: scrap rows in the detail panel have image thumbnails;
      // wire up the lightbox.
      scriptModules: ['/static/dist/content-view-client.js'],
    }),
  };
}

function renderNotFound(message: string): string {
  const body = html`
    ${renderEditorialFolio('content', 'not found')}
    <main class="content-page">
      <section class="content-error">
        <h1>Not found</h1>
        <p>${message}</p>
        <p><a href="/dev/content">← back to the content view</a></p>
      </section>
    </main>`;
  return layout({
    title: 'Not found — deskwork',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/content.css',
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    scriptModules: [],
  });
}
