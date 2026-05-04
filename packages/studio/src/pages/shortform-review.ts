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
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';
import { escapeHtml, gloss } from './html.ts';

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

function stateLabel(state?: string): string {
  return (state ?? '').replace('-', ' ');
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

function renderVersionsStrip(
  versions: readonly DraftVersion[],
  current: DraftVersion,
): RawHtml {
  if (versions.length <= 1) return unsafe('');
  const links = versions
    .map((v) => {
      const isActive = v.version === current.version;
      const href = `?v=${v.version}`;
      return html`<a href="${href}" class="${isActive ? 'active' : ''}">v${v.version}</a>`;
    })
    .join('');
  return unsafe(html`<span class="er-strip-versions">${unsafe(links)}</span>`);
}

function pendingSkillCmd(workflow: DraftWorkflowItem): string {
  const { site, slug, state } = workflow;
  if (state === 'iterating') {
    return `/deskwork:iterate --site ${site} ${slug}`;
  }
  if (state === 'approved') {
    return `/deskwork:approve --site ${site} ${slug}`;
  }
  return '';
}

function shortcutChipWrap(buttonHtml: string, letter: 'a' | 'i' | 'r'): string {
  return html`<span class="er-shortcut-chip-wrap">${unsafe(buttonHtml)}<small class="er-shortcut-chip"><kbd>${letter}</kbd><kbd>${letter}</kbd></small></span>`;
}

function renderControlsRight(workflow: DraftWorkflowItem): RawHtml {
  const isActive = workflow.state === 'open' || workflow.state === 'in-review';
  const isApproved = workflow.state === 'approved';
  const isIterating = workflow.state === 'iterating';
  const isTerminal = workflow.state === 'applied' || workflow.state === 'cancelled';
  const buttons: string[] = [];
  buttons.push(html`<button class="er-btn er-btn-small" data-action="toggle-edit" type="button">Edit</button><span class="er-edit-mode-label" data-mode="preview">preview</span>`);
  if (isActive) {
    buttons.push(
      shortcutChipWrap(
        html`<button class="er-btn er-btn-small er-btn-approve" data-action="approve" type="button">Approve</button>`,
        'a',
      ),
    );
    buttons.push(
      shortcutChipWrap(
        html`<button class="er-btn er-btn-small" data-action="iterate" type="button">Iterate</button>`,
        'i',
      ),
    );
    buttons.push(
      shortcutChipWrap(
        html`<button class="er-btn er-btn-small er-btn-reject" data-action="reject" type="button">Reject</button>`,
        'r',
      ),
    );
  }
  if (isApproved) {
    const applyCmd = pendingSkillCmd(workflow);
    buttons.push(html`<span class="er-pending-state">awaiting apply…</span>`);
    buttons.push(html`<button class="er-btn er-btn-small" data-action="copy-cmd" data-cmd="${applyCmd}" title="Copy ${applyCmd} to clipboard" type="button">copy <code>/deskwork:approve</code></button>`);
    buttons.push(
      shortcutChipWrap(
        html`<button class="er-btn er-btn-small er-btn-reject" data-action="reject" type="button">Reject</button>`,
        'r',
      ),
    );
  }
  if (isIterating) {
    const iterateCmd = pendingSkillCmd(workflow);
    buttons.push(html`<span class="er-pending-state">agent iterating…</span>`);
    buttons.push(html`<button class="er-btn er-btn-small" data-action="copy-cmd" data-cmd="${iterateCmd}" title="Copy ${iterateCmd} to clipboard" type="button">copy <code>/deskwork:iterate</code></button>`);
  }
  if (isTerminal) {
    buttons.push(html`<span class="er-pending-state er-pending-state--filed">filed (${workflow.state})</span>`);
  }
  buttons.push(html`<button class="er-btn er-btn-small" data-action="shortcuts" type="button" aria-label="Show keyboard shortcuts" title="Keyboard shortcuts">?</button>`);
  return unsafe(`<span class="er-strip-right">${buttons.join('')}</span>`);
}

function renderShortcutsOverlay(): RawHtml {
  return unsafe(html`
    <div class="er-shortcuts" data-shortcuts-overlay hidden role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="er-shortcuts-backdrop" data-shortcuts-backdrop></div>
      <div class="er-shortcuts-panel">
        <h2>Keyboard</h2>
        <dl>
          <dt><kbd>e</kbd> / dbl-click</dt><dd>toggle edit mode</dd>
          <dt><kbd>a</kbd> <kbd>a</kbd></dt><dd>approve <em>— press twice within 500ms</em></dd>
          <dt><kbd>i</kbd> <kbd>i</kbd></dt><dd>iterate <em>— press twice within 500ms</em></dd>
          <dt><kbd>r</kbd> <kbd>r</kbd></dt><dd>reject <em>— press twice within 500ms</em></dd>
          <dt><kbd>?</kbd></dt><dd>this panel</dd>
          <dt><kbd>esc</kbd></dt><dd>close</dd>
        </dl>
        <p class="er-shortcuts-footer">Press <kbd>?</kbd> anytime.</p>
      </div>
    </div>`);
}

function renderEditToolbar(): RawHtml {
  return unsafe(html`
    <div class="er-edit-toolbar" data-edit-toolbar hidden>
      <div class="er-edit-modes" role="tablist" aria-label="Editor mode">
        <button class="er-edit-mode-btn" data-edit-view="source" type="button" aria-pressed="true">Source</button>
        <button class="er-edit-mode-btn" data-edit-view="split" type="button" aria-pressed="false">Split</button>
        <button class="er-edit-mode-btn" data-edit-view="preview" type="button" aria-pressed="false">Preview</button>
      </div>
      <div class="er-edit-actions">
        <button class="er-btn er-btn-small" data-action="focus-mode" type="button" title="Distraction-free mode (Shift+F)" aria-pressed="false">Focus ⛶</button>
        <button class="er-btn er-btn-primary" data-action="save-version" type="button">Save as new version</button>
        <button class="er-btn" data-action="cancel-edit" type="button">Cancel</button>
        <span class="er-edit-hint" data-edit-hint></span>
      </div>
    </div>`);
}

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

  const shortformMeta: RawHtml = unsafe(html`
    <div class="er-shortform-meta">
      <span class="er-platform">${workflow.platform ?? 'other'}</span>
      ${workflow.channel
        ? unsafe(html`<span class="er-channel">${workflow.channel}</span>`)
        : ''}
    </div>`);

  const folioSpine = `shortform · ${workflow.platform ?? '?'}${workflow.channel ? ` · ${workflow.channel}` : ''} · ${slug}`;

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
      ${renderEditorialFolio('shortform', folioSpine)}
      ${shortformMeta}
      <div class="er-strip">
        <div class="er-strip-inner">
          <a class="er-strip-back" href="/dev/editorial-studio" title="Back to the editorial studio">← studio</a>
          <span class="er-strip-galley">${gloss('galley')} <em>№ ${currentVersion.version}</em></span>
          <span class="er-strip-slug">${workflow.site} / ${workflow.slug}</span>
          ${renderVersionsStrip(versions, currentVersion)}
          <span class="er-strip-center">
            <span class="er-stamp er-stamp-big er-stamp-${workflow.state}" data-state-label>
              ${stateLabel(workflow.state)}
            </span>
            <span class="er-strip-hint">double-click to edit · <kbd>?</kbd> for shortcuts</span>
          </span>
          ${renderControlsRight(workflow)}
        </div>
      </div>
      ${renderEditToolbar()}
      <article class="er-page">
        ${unsafe(pageGrid)}
      </article>
      <div class="er-toast" data-toast hidden></div>
      ${renderShortcutsOverlay()}
      <div class="er-poll-indicator" data-poll>auto-refresh · 8s</div>
    </div>`;

  return layout({
    title: `${titleField} — Review`,
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/blog-figure.css',
      '/static/css/review-viewport.css',
    ],
    bodyHtml: body,
    embeddedJson: [{ id: 'draft-state', data: draftState }],
    scriptModules: ['editorial-review-client'],
  });
}
