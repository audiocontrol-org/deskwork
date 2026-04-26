/**
 * Per-post review page — `/dev/editorial-review/:slug`.
 *
 * Reads the workflow + versions for the given (site, slug), renders the
 * draft as HTML, embeds annotations as JSON for the client to overlay
 * margin notes and comment markers.
 *
 * NOTE: Phase 3 lands a minimal scaffold. Phase 4 ports the full
 * audiocontrol [slug].astro template (~357 lines) and matches the
 * editorial-review-client.ts (~1,609 lines) hydration model.
 */

import { handleGetWorkflow } from '@deskwork/core/review/handlers';
import { readVersions, readAnnotations } from '@deskwork/core/review/pipeline';
import { renderMarkdownToHtml, parseDraftFrontmatter } from '@deskwork/core/review/render';
import type { DraftAnnotation, DraftVersion, DraftWorkflowItem } from '@deskwork/core/review/types';
import type { StudioContext } from '../routes/api.ts';
import { layout } from './layout.ts';

interface ReviewQuery {
  site: string | null;
  version: string | null;
}

export function renderReviewPage(
  ctx: StudioContext,
  slug: string,
  query: ReviewQuery,
): string {
  const fetched = handleGetWorkflow(ctx.projectRoot, ctx.config, {
    id: null,
    site: query.site,
    slug,
    contentKind: 'longform',
    platform: null,
    channel: null,
  });

  if (fetched.status !== 200) {
    return errorPage(`No longform workflow for ${query.site ?? '(default)'}/${slug}.`, fetched);
  }

  const { workflow, versions } = fetched.body as {
    workflow: DraftWorkflowItem;
    versions: DraftVersion[];
  };

  const versionToShow = pickVersion(versions, query.version, workflow.currentVersion);
  if (!versionToShow) {
    return errorPage(`No version v${query.version} for workflow ${workflow.id}.`, fetched);
  }

  const annotations = readAnnotations(ctx.projectRoot, ctx.config, workflow.id);
  const versionsForList = readVersions(ctx.projectRoot, ctx.config, workflow.id);

  const { frontmatter, body: markdownBody } = parseDraftFrontmatter(versionToShow.markdown);
  // Render markdown→HTML synchronously by awaiting (Hono handlers are async-friendly)
  // — but renderMarkdownToHtml returns a Promise. We compose at render time below.
  // For simplicity, this scaffold does the markdown render eagerly via top-level await pattern;
  // production version threads through the async page handler.
  const renderedHtml = '<!-- markdown render deferred to client; Phase 4 -->';

  const data = {
    workflow,
    version: versionToShow,
    versions: versionsForList,
    annotations,
    frontmatter,
  };

  const body = `
    <main data-review-ui="longform" data-workflow-id="${escapeAttr(workflow.id)}" data-version="${versionToShow.version}">
      <header>
        <h1>${escapeHtml(stringField(frontmatter.title) ?? slug)}</h1>
        <p class="muted">
          <a href="/dev/editorial-studio">← studio</a>
          · ${escapeHtml(workflow.site)}/${escapeHtml(workflow.slug)}
          · <span class="state state-${escapeAttr(workflow.state)}">${escapeHtml(workflow.state)}</span>
          · v${versionToShow.version} of ${versionsForList.length}
        </p>
      </header>
      <article id="draft-body" data-version="${versionToShow.version}">
        ${renderedHtml}
        <pre class="muted scaffold-fallback">${escapeHtml(markdownBody)}</pre>
      </article>
    </main>
  `;

  return layout({
    title: `${stringField(frontmatter.title) ?? slug} — Review`,
    cssHrefs: ['/static/review.css'],
    bodyHtml: body,
    embeddedJson: { id: 'draft-state', data },
    scriptModules: ['/static/client.js'],
  });
}

function pickVersion(versions: DraftVersion[], requested: string | null, currentVersion: number): DraftVersion | null {
  if (!requested) return versions.find((v) => v.version === currentVersion) ?? null;
  const n = parseInt(requested, 10);
  if (!Number.isFinite(n)) return null;
  return versions.find((v) => v.version === n) ?? null;
}

function errorPage(message: string, fetched: { status: number; body: unknown }): string {
  return layout({
    title: 'Review — error',
    cssHrefs: ['/static/review.css'],
    bodyHtml: `
      <main>
        <h1>Could not load workflow</h1>
        <p>${escapeHtml(message)}</p>
        <pre>${escapeHtml(JSON.stringify(fetched, null, 2))}</pre>
        <p><a href="/dev/editorial-studio">← back to studio</a></p>
      </main>
    `,
    embeddedJson: null,
    scriptModules: [],
  });
}

function stringField(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// Re-exported renderMarkdownToHtml + DraftAnnotation are not yet used in this
// scaffold — they're imported so the dependencies are visible and Phase 4
// can wire them up. Remove the suppression once they're consumed.
void renderMarkdownToHtml;
void (null as unknown as DraftAnnotation);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
