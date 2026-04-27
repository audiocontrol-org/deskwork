/**
 * Per-post review page — `/dev/editorial-review/:slug`.
 *
 * Renders one workflow's current draft inside a margin-note review
 * shell. The body markdown is rendered server-side (so the operator
 * sees content immediately, no flash of unrendered text), with the
 * frontmatter description injected as a dek paragraph after the
 * body's repeated H1.
 *
 * Ported from `pages/dev/editorial-review/[slug].astro`. Differences:
 *   - The full <BlogLayout> Astro component went away; we render the
 *     review shell as the page body. Site-specific blog chrome was
 *     never useful in the review surface (the review is about the
 *     prose, not the page chrome).
 *   - Site defaults to `config.defaultSite` rather than the hardcoded
 *     `'editorialcontrol'` upstream used.
 *   - The outline-split helper lives under the plugin tree's `public/src/`
 *     (it's a browser module) but it's pure TS, so it can run server-side
 *     for the initial render too. After the marketplace-install fix
 *     (issue #4), `public/` was relocated from packages/studio/ into
 *     plugins/deskwork-studio/, hence the long relative import below.
 */

import { handleGetWorkflow } from '@deskwork/core/review/handlers';
import type {
  DraftVersion,
  DraftWorkflowItem,
} from '@deskwork/core/review/types';
import {
  parseDraftFrontmatter,
  renderMarkdownToHtml,
} from '@deskwork/core/review/render';
import { splitOutline } from '../../../../plugins/deskwork-studio/public/src/outline-split.ts';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { escapeHtml } from './html.ts';

interface ReviewQuery {
  /** ?site=<slug> override; null falls back to config.defaultSite. */
  site: string | null;
  /** ?v=<n>; null shows the workflow's currentVersion. */
  version: string | null;
  /** ?kind=outline | longform; null defaults to longform. */
  kind?: string | null;
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

function pickContentKind(rawKind: string | null | undefined): 'longform' | 'outline' {
  return rawKind === 'outline' ? 'outline' : 'longform';
}

function pickSite(ctx: StudioContext, raw: string | null): string {
  if (raw && raw in ctx.config.sites) return raw;
  return ctx.config.defaultSite;
}

function stringField(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

interface PreparedRender {
  fm: Record<string, unknown>;
  bodyHtml: string;
  outlineHtml: string;
}

async function prepareRender(
  markdown: string,
  contentKind: 'longform' | 'outline',
): Promise<PreparedRender> {
  const parsed = parseDraftFrontmatter(markdown);
  const fm = parsed.frontmatter;

  const split = contentKind === 'outline'
    ? { body: parsed.body, outline: '', present: false, startLine: -1, endLine: -1 }
    : splitOutline(parsed.body);

  const bodyHtml = await renderMarkdownToHtml(split.body);

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

  const outlineHtml = split.outline
    ? await renderMarkdownToHtml(split.outline)
    : '';

  return { fm, bodyHtml: renderedHtml, outlineHtml };
}

function stateLabel(state?: string): string {
  return (state ?? '').replace('-', ' ');
}

function renderVersionsStrip(
  versions: readonly DraftVersion[],
  site: string,
  contentKind: 'longform' | 'outline',
  current: DraftVersion,
): RawHtml {
  if (versions.length <= 1) return unsafe('');
  const links = versions
    .map((v) => {
      const isActive = v.version === current.version;
      const kindBit = contentKind === 'outline' ? '&kind=outline' : '';
      const href = `?site=${site}${kindBit}&v=${v.version}`;
      return html`<a href="${href}" class="${isActive ? 'active' : ''}">v${v.version}</a>`;
    })
    .join('');
  return unsafe(html`<span class="er-strip-versions">${unsafe(links)}</span>`);
}

function renderControlsRight(workflow: DraftWorkflowItem): RawHtml {
  const isActive = workflow.state === 'open' || workflow.state === 'in-review';
  const isApproved = workflow.state === 'approved';
  const isIterating = workflow.state === 'iterating';
  const isTerminal = workflow.state === 'applied' || workflow.state === 'cancelled';
  const buttons: string[] = [];
  buttons.push(html`<button class="er-btn er-btn-small" data-action="toggle-edit" type="button">Edit</button>`);
  if (isActive) {
    buttons.push(html`<button class="er-btn er-btn-small er-btn-approve" data-action="approve" type="button">Approve</button>`);
    buttons.push(html`<button class="er-btn er-btn-small" data-action="iterate" type="button">Iterate</button>`);
    buttons.push(html`<button class="er-btn er-btn-small er-btn-reject" data-action="reject" type="button">Reject</button>`);
  }
  if (isApproved) {
    buttons.push(html`<button class="er-btn er-btn-small" disabled title="Run /editorial-approve in Claude Code" type="button">Apply</button>`);
    buttons.push(html`<button class="er-btn er-btn-small er-btn-reject" data-action="reject" type="button">Reject</button>`);
  }
  if (isIterating) {
    buttons.push(html`<span style="font-family: var(--er-font-display); font-style: italic; color: var(--er-stamp-purple);">agent iterating…</span>`);
  }
  if (isTerminal) {
    buttons.push(html`<span style="font-family: var(--er-font-display); font-style: italic; color: var(--er-faded);">filed (${workflow.state})</span>`);
  }
  buttons.push(html`<button class="er-btn er-btn-small" data-action="shortcuts" type="button" aria-label="Show keyboard shortcuts" title="Keyboard shortcuts">?</button>`);
  return unsafe(`<span class="er-strip-right">${buttons.join('')}</span>`);
}

function renderError(slug: string, site: string, contentKind: 'longform' | 'outline', message: string): string {
  const startCmd = contentKind === 'outline'
    ? `/editorial-outline --site ${site} ${slug}`
    : `/editorial-draft-review --site ${site} ${slug}`;
  const body = html`
    <div data-review-ui="longform">
      <div class="er-error">
        <h1>No galley to review.</h1>
        <p><strong>Slug:</strong> <code>${slug}</code></p>
        <p>${message}</p>
        <p>Start one with:</p>
        <p><code>${startCmd}</code></p>
        <p style="margin-top: 2rem;"><a href="/dev/editorial-studio">← back to the studio</a></p>
      </div>
    </div>`;
  return layout({
    title: `Review — ${slug} — error`,
    cssHrefs: ['/static/css/editorial-review.css'],
    bodyHtml: body,
    scriptModules: [],
  });
}

function renderShortcutsOverlay(): RawHtml {
  return unsafe(html`
    <div class="er-shortcuts" data-shortcuts-overlay hidden role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="er-shortcuts-backdrop" data-shortcuts-backdrop></div>
      <div class="er-shortcuts-panel">
        <h2>Keyboard</h2>
        <dl>
          <dt><kbd>e</kbd> / dbl-click</dt><dd>toggle edit mode</dd>
          <dt>select text</dt><dd>leave a margin note</dd>
          <dt><kbd>⌘</kbd><kbd>↵</kbd> / <kbd>ctrl</kbd><kbd>↵</kbd></dt><dd>save margin note (in composer)</dd>
          <dt><kbd>a</kbd></dt><dd>approve</dd>
          <dt><kbd>i</kbd></dt><dd>iterate</dd>
          <dt><kbd>r</kbd></dt><dd>reject</dd>
          <dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>next / previous margin note</dd>
          <dt><kbd>?</kbd></dt><dd>this panel</dd>
          <dt><kbd>esc</kbd></dt><dd>close / cancel composer</dd>
        </dl>
        <p class="er-shortcuts-footer">Press <kbd>?</kbd> anytime.</p>
      </div>
    </div>`);
}

function renderMarginalia(): RawHtml {
  return unsafe(html`
    <aside class="er-marginalia" data-comments-sidebar aria-label="Margin notes">
      <p class="er-marginalia-head">Margin notes</p>
      <p class="er-marginalia-empty" data-sidebar-empty>Select text in the draft, then either click the floating <em>Mark</em> pencil above your selection — or click anywhere here in the margin to open the note.</p>
      <section class="er-marginalia-composer" data-comment-composer hidden aria-label="New margin note">
        <p class="er-marginalia-composer-head">New mark</p>
        <div class="er-marginalia-composer-quote" data-composer-quote></div>
        <label class="er-marginalia-composer-label" for="comment-category">Mark as</label>
        <select id="comment-category" class="er-marginalia-composer-select" data-comment-category>
          <option value="other" selected>other</option>
          <option value="voice-drift">voice-drift</option>
          <option value="missing-receipt">missing-receipt</option>
          <option value="tutorial-framing">tutorial-framing</option>
          <option value="saas-vocabulary">saas-vocabulary</option>
          <option value="fake-authority">fake-authority</option>
          <option value="structural">structural</option>
        </select>
        <label class="er-marginalia-composer-label" for="comment-text">Note</label>
        <textarea id="comment-text" class="er-marginalia-composer-textarea" data-comment-text rows="4"
          placeholder="What needs attention here?"></textarea>
        <div class="er-marginalia-composer-actions">
          <button type="button" class="er-btn er-btn-small" data-action="cancel-comment">Cancel</button>
          <button type="button" class="er-btn er-btn-small er-btn-primary" data-action="submit-comment">Leave mark</button>
        </div>
      </section>
      <ol class="er-marginalia-list" data-sidebar-list></ol>
    </aside>`);
}

function renderEditMode(outlineHasContent: boolean): RawHtml {
  const outlineBtnAttrs = outlineHasContent ? '' : ' hidden';
  return unsafe(html`
    <div class="er-edit-mode" data-edit-toolbar hidden>
      <div class="er-edit-chrome">
        <div class="er-edit-modes" role="tablist" aria-label="Editor mode">
          <button class="er-edit-mode-btn" data-edit-view="source" type="button" aria-pressed="true">Source</button>
          <button class="er-edit-mode-btn" data-edit-view="split" type="button" aria-pressed="false">Split</button>
          <button class="er-edit-mode-btn" data-edit-view="preview" type="button" aria-pressed="false">Preview</button>
        </div>
        <div class="er-edit-actions">
          <button class="er-btn er-btn-small" data-action="outline-drawer" type="button" title="Show the outline for reference (O)" aria-pressed="false"${unsafe(outlineBtnAttrs)}>Outline ↗</button>
          <button class="er-btn er-btn-small" data-action="focus-mode" type="button" title="Distraction-free mode (Shift+F)" aria-pressed="false">Focus ⛶</button>
          <button class="er-btn er-btn-primary" data-action="save-version" type="button">Save as new version</button>
          <button class="er-btn" data-action="cancel-edit" type="button">Cancel</button>
          <span class="er-edit-hint" data-edit-hint></span>
        </div>
      </div>
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

function renderOutlineDrawer(outlineHtml: string): RawHtml {
  const hidden = outlineHtml ? '' : ' hidden';
  return unsafe(html`
    <button class="er-outline-tab" data-outline-tab type="button" aria-label="Show outline"${unsafe(hidden)}>
      <span class="er-outline-tab-label">Outline</span>
    </button>
    <aside class="er-outline-drawer" data-outline-drawer aria-label="Outline reference" hidden>
      <header class="er-outline-drawer-head">
        <span class="er-outline-drawer-kicker">Briefing sheet</span>
        <button type="button" class="er-outline-drawer-close" data-outline-close aria-label="Close outline (O or Esc)">×</button>
      </header>
      <div class="er-outline-drawer-body" data-outline-drawer-body>${unsafe(outlineHtml)}</div>
      <footer class="er-outline-drawer-foot">
        <span>Read-only · edit via <code>/editorial-iterate --kind outline</code></span>
      </footer>
    </aside>`);
}

export async function renderReviewPage(
  ctx: StudioContext,
  slug: string,
  query: ReviewQuery,
): Promise<string> {
  const site = pickSite(ctx, query.site);
  const contentKind = pickContentKind(query.kind ?? null);

  const fetched = handleGetWorkflow(ctx.projectRoot, ctx.config, {
    id: null,
    site,
    slug,
    contentKind,
    platform: null,
    channel: null,
  });

  if (fetched.status !== 200 || !isSuccessBody(fetched.body)) {
    return renderError(slug, site, contentKind, errorFromBody(fetched.body));
  }

  const { workflow, versions } = fetched.body;
  const requested = query.version ? parseInt(query.version, 10) : workflow.currentVersion;
  const currentVersion =
    versions.find((v) => v.version === requested) ?? versions[versions.length - 1];

  if (!currentVersion) {
    return renderError(slug, site, contentKind, 'no current version on this workflow');
  }

  const { fm, bodyHtml, outlineHtml } = await prepareRender(
    currentVersion.markdown,
    contentKind,
  );

  const draftState = { workflow, currentVersion, versions };

  const titleField = stringField(fm.title) ?? `Draft: ${slug}`;

  const body = html`
    <div data-review-ui="longform" class="er-review-shell">
      <div class="er-draft-frame">
        <div id="draft-body" data-draft-body
          title="Double-click to edit · select text to leave a margin note">${unsafe(bodyHtml)}</div>
        ${renderEditMode(outlineHtml.length > 0)}
      </div>
      <div class="er-strip">
        <a class="er-strip-back" href="/dev/editorial-studio" title="Back to the editorial studio">← studio</a>
        <span class="er-strip-galley">Galley <em>№ ${currentVersion.version}</em></span>
        <span class="er-strip-slug">${workflow.site} / ${workflow.slug}</span>
        ${renderVersionsStrip(versions, site, contentKind, currentVersion)}
        <span class="er-strip-center">
          <span class="er-stamp er-stamp-big er-stamp-${workflow.state}" data-state-label>
            ${stateLabel(workflow.state)}
          </span>
          <span class="er-strip-hint" aria-hidden="true">select text to mark · double-click to edit · <kbd>?</kbd> for shortcuts</span>
        </span>
        ${renderControlsRight(workflow)}
      </div>
      ${renderMarginalia()}
      <button class="er-pencil-btn" data-add-comment-btn hidden type="button">Mark</button>
      ${renderOutlineDrawer(outlineHtml)}
      <div class="er-toast" data-toast hidden></div>
      ${renderShortcutsOverlay()}
      <div class="er-poll-indicator" data-poll>auto-refresh · 8s</div>
    </div>`;

  return layout({
    title: `${titleField} — Review`,
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/blog-figure.css',
      '/static/css/review-viewport.css',
    ],
    bodyHtml: body,
    embeddedJson: [{ id: 'draft-state', data: draftState }],
    scriptModules: ['/static/dist/editorial-review-client.js'],
  });
}
