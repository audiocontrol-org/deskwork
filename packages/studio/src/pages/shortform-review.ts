/**
 * Shortform review surface — `/dev/editorial-review/<workflow-id>`
 * (when the bare-UUID resolves to a workflow record, not an entry).
 *
 * Phase 34a (#171): the longform/outline halves of `pages/review.ts`
 * were retired. The workflow-keyed shortform pipeline survives
 * intentionally — operator decision recorded in the PRD ("Not a
 * shortform retirement"). This file holds the slim subset of the
 * old renderer that shortform actually uses.
 *
 * Retirement: when shortform's own migration phase ships (tracked
 * separately from #171), `pages/shortform-review.ts` and the bare-UUID
 * route's workflow branch get deleted together. Until then, this file
 * is a stable backwards-compat shim — not a "for now" code-comment IOU.
 *
 * Workflow-keyed wording in this file is documenting that deliberate
 * deferral; do not flag in audits.
 *
 * Step 2.2.10 (v7 universal chrome + state-machine compliance):
 *   - Server-side: er-strip / er-stamp / er-pending-state / shortcut
 *     overlay / state-branched control rendering all REMOVED. The
 *     universal `renderMobileBar` primitive + a shortform-specific
 *     sheet host (`./shortform-review-mobile-sheet.ts`) replace them.
 *   - Per DESIGN-STANDARDS.md § Universal bar contract: this surface
 *     composes its `Cell[]` mechanically (TOC / Versions / Actions)
 *     and passes it to `renderMobileBar`. No bespoke chrome shape.
 *   - Per DESKWORK-STATE-MACHINE.md Commandment III: no review-state
 *     labels on the page (the stamp + pending pills were the
 *     violations).
 *   - The desktop edit-mode panes (`renderEditPanes`) stay — they're
 *     gated by the existing `data-edit-mode` body attribute and the
 *     Edit toolbar is still part of the desktop chrome. Mobile edit
 *     entry-point is deferred to a future task (the workplan keeps
 *     the broader shortform state-machine migration explicitly out
 *     of scope for this step).
 */

import { handleGetWorkflow } from '@deskwork/core/review/handlers';
import { extractToc } from '@deskwork/core/review/toc';
import type {
  DraftVersion,
  DraftWorkflowItem,
} from '@deskwork/core/review/types';
import {
  parseDraftFrontmatter,
  renderMarkdownToHtml,
} from '@deskwork/core/review/render';
import type { StudioContext } from '../routes/api.ts';
import { escapeHtml, html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';
import { renderMasthead } from './masthead.ts';
import { renderMastheadMenu } from './masthead-menu.ts';
import { renderMobileBar } from './mobile-bar.ts';
import {
  getShortformBarCells,
  renderShortformMobileSheet,
} from './shortform-review-mobile-sheet.ts';

interface ShortformReviewQuery {
  /** ?v=<n>; null shows the workflow's currentVersion. */
  version: string | null;
}

function isSuccessBody(
  body: unknown,
): body is { workflow: DraftWorkflowItem; versions: DraftVersion[] } {
  if (typeof body !== 'object' || body === null) return false;
  return 'workflow' in body && 'versions' in body;
}

function errorFromBody(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const value = Reflect.get(body, 'error');
    if (typeof value === 'string') return value;
  }
  return 'unknown error';
}

function stringField(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

interface PreparedRender {
  fm: Record<string, unknown>;
  bodyHtml: string;
}

async function prepareShortformRender(markdown: string): Promise<PreparedRender> {
  const parsed = parseDraftFrontmatter(markdown);
  const fm = parsed.frontmatter;
  const bodyHtml = await renderMarkdownToHtml(parsed.body);

  // Inject the description as a dek after the body's first <h1>.
  const description = stringField(fm.description);
  const dekHtml = description
    ? `<p class="er-dispatch-dek">${escapeHtml(description)}</p>`
    : '';
  const h1Close = bodyHtml.indexOf('</h1>');
  const renderedHtml =
    dekHtml && h1Close >= 0
      ? bodyHtml.slice(0, h1Close + 5) + dekHtml + bodyHtml.slice(h1Close + 5)
      : dekHtml + bodyHtml;

  return { fm, bodyHtml: renderedHtml };
}

/**
 * Desktop-only edit panes. The `data-edit-mode` body attribute is the
 * gate (set by the existing client toggle-edit handler). On mobile,
 * edit mode is not currently surfaced from this surface — the broader
 * shortform state-machine migration is the right place to design that.
 */
function renderEditPanes(): RawHtml {
  return unsafe(html`
    <div class="er-edit-mode" data-edit-panes-host hidden>
      <div class="er-edit-panes" data-edit-panes data-view="source">
        <div class="er-edit-source" data-edit-source aria-label="Markdown source"></div>
        <div class="er-edit-preview" data-edit-preview aria-label="Rendered preview"></div>
      </div>
      <textarea id="draft-edit" data-draft-edit hidden></textarea>
      <div class="er-focus-exit" data-focus-exit aria-hidden="true">
        <button type="button" data-action="exit-focus" title="Exit focus (Esc)">← exit focus</button>
      </div>
      <div class="er-focus-save" data-focus-save aria-hidden="true">
        <button type="button" class="er-btn er-btn-small er-btn-primary" data-action="save-version">Save</button>
        <span class="er-focus-save-hint" data-focus-save-hint></span>
      </div>
    </div>`);
}

function renderError(workflowId: string, message: string): string {
  const body = html`
    <div data-review-ui="shortform">
      ${renderEditorialFolio('shortform', `shortform · ${workflowId}`)}
      <div class="er-error">
        <h1>No galley to review.</h1>
        <p><strong>Workflow:</strong> <code>${workflowId}</code></p>
        <p>${message}</p>
        <p style="margin-top: 2rem;"><a href="/dev/editorial-studio">← back to the studio</a></p>
      </div>
    </div>`;
  return layout({
    title: `Review — ${workflowId} — error`,
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
    ],
    bodyHtml: body,
    scriptModules: [],
  });
}

/**
 * Render the shortform review surface for a workflow id. The bare-UUID
 * route in `server.ts` calls this when `:id` resolves to a workflow
 * record (i.e. shortform). Longform UUIDs 301-redirect to the
 * entry-keyed surface instead.
 */
export async function renderShortformReviewPage(
  ctx: StudioContext,
  workflowId: string,
  query: ShortformReviewQuery,
): Promise<string> {
  const fetched = handleGetWorkflow(ctx.projectRoot, ctx.config, {
    id: workflowId,
    entryId: null,
    site: null,
    slug: null,
    contentKind: null,
    platform: null,
    channel: null,
  });

  if (fetched.status !== 200 || !isSuccessBody(fetched.body)) {
    return renderError(workflowId, errorFromBody(fetched.body));
  }

  const { workflow, versions } = fetched.body;
  const slug = workflow.slug;

  const requested = query.version ? parseInt(query.version, 10) : workflow.currentVersion;
  const currentVersion =
    versions.find((v) => v.version === requested) ?? versions[versions.length - 1];

  if (!currentVersion) {
    return renderError(workflowId, 'no current version on this workflow');
  }

  const { fm, bodyHtml } = await prepareShortformRender(currentVersion.markdown);
  const draftState = { workflow, currentVersion, versions };
  const titleField = stringField(fm.title) ?? `Draft: ${slug}`;

  // #244 — extract TOC from the rendered body. `rehype-slug` already
  // gave every h2/h3/h4 an `id`; `extractToc` reads the slugs + text.
  const tocEntries = extractToc(bodyHtml);

  const shortformMeta: RawHtml = unsafe(html`
    <div class="er-shortform-meta">
      <span class="er-platform">${workflow.platform ?? 'other'}</span>
      ${workflow.channel
        ? unsafe(html`<span class="er-channel">${workflow.channel}</span>`)
        : ''}
    </div>`);

  const folioSpine = `shortform · ${workflow.platform ?? '?'}${workflow.channel ? ` · ${workflow.channel}` : ''} · ${slug}`;

  // v7 universal masthead (mobile-only at this commit). Kicker carries
  // the platform badge + channel as inline markup; the meta tag holds
  // the galley number. Slug occupies the bottom row.
  const platformLabel = workflow.platform ?? 'other';
  const channelLabel = workflow.channel ? ` ${workflow.channel}` : '';
  const mastheadKicker = unsafe(html`<span class="platform">${platformLabel}</span>${channelLabel}`);
  const masthead = renderMasthead({
    kickerHtml: mastheadKicker,
    slug,
    metaInline: `№ ${currentVersion.version}`,
    isHub: false,
  });

  // v7 universal mobile bar. The cell list is composed mechanically
  // from the surface's TOC + Versions + (always) Actions per
  // DESIGN-STANDARDS.md § Universal bar contract. The Actions cell
  // guarantees the bar is never empty.
  const barCells = getShortformBarCells({ tocEntries, versions });
  const mobileBar = renderMobileBar({ contextual: barCells });
  const mobileSheet = renderShortformMobileSheet({
    tocEntries,
    versions,
    workflow,
    currentVersion,
  });

  const pageGrid = html`
    <div class="er-page-grid">
      <div class="er-draft-frame">
        <div id="draft-body" data-draft-body
          title="Double-click to edit">${unsafe(bodyHtml)}</div>
        ${renderEditPanes()}
      </div>
    </div>`;

  const body = html`
    <div data-review-ui="shortform" class="er-review-shell">
      ${masthead}
      ${renderMastheadMenu()}
      ${renderEditorialFolio('shortform', folioSpine)}
      ${shortformMeta}
      <article class="er-page">
        ${unsafe(pageGrid)}
      </article>
      ${mobileBar}
      ${mobileSheet}
      <div class="er-toast" data-toast hidden></div>
    </div>`;

  return layout({
    title: `${titleField} — Review`,
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/blog-figure.css',
      '/static/css/review-viewport.css',
      '/static/css/mobile-shell.css',
    ],
    bodyHtml: body,
    embeddedJson: [{ id: 'draft-state', data: draftState }],
    scriptModules: ['editorial-review-client'],
  });
}
