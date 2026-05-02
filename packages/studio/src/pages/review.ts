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
import { readCalendar } from '@deskwork/core/calendar';
import { findEntry, findEntryById } from '@deskwork/core/calendar-mutations';
import type { CalendarEntry } from '@deskwork/core/types';
import type { ContentIndex } from '@deskwork/core/content-index';
import { splitOutline } from '@deskwork/core/outline-split';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';
import { escapeHtml, gloss } from './html.ts';
import { renderScrapbookDrawer } from './review-scrapbook-drawer.ts';
import { existsSync } from 'node:fs';
import { resolveCalendarPath } from '@deskwork/core/paths';

/**
 * Per-request content-index getter. The route layer wires this to the
 * Hono context's memoized cache so a single review render only builds
 * the index once per site even though both the inline-text loader and
 * the scrapbook drawer ask for it. When omitted, callers fall back to
 * slug-template path resolution.
 */
export type ReviewIndexGetter = (site: string) => ContentIndex;

interface ReviewQuery {
  /** ?site=<slug> override; null falls back to config.defaultSite. */
  site: string | null;
  /** ?v=<n>; null shows the workflow's currentVersion. */
  version: string | null;
  /** ?kind=outline | longform; null defaults to longform. */
  kind?: string | null;
}

/**
 * How the route resolved the request. Phase 19d added the canonical
 * id-based URL; the legacy slug URL still resolves to a render via the
 * 302-redirect path (the redirect target lands here as `kind: 'id'`).
 *
 * `kind: 'slug'` is reserved for the legacy fallback when the calendar
 * entry has no id stamped on it yet — pre-doctor state, not a "fallback"
 * the project rules forbid but the migration path the plan calls out.
 *
 * Phase 21c added `kind: 'workflow'` so the dashboard can deep-link
 * straight to a specific workflow id without first knowing the entry
 * id — shortform cells use this to land on the unified review surface
 * after `start-shortform` returns the new workflow.
 */
export type ReviewLookup =
  | { kind: 'id'; entryId: string; slug: string }
  | { kind: 'slug'; slug: string }
  | { kind: 'workflow'; workflowId: string };

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

function pickContentKind(
  rawKind: string | null | undefined,
): 'longform' | 'outline' | 'shortform' {
  if (rawKind === 'outline') return 'outline';
  if (rawKind === 'shortform') return 'shortform';
  return 'longform';
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
  contentKind: 'longform' | 'outline' | 'shortform',
): Promise<PreparedRender> {
  const parsed = parseDraftFrontmatter(markdown);
  const fm = parsed.frontmatter;

  // Outline + shortform render the body as-is (no outline-split). Only
  // longform pulls the optional briefing-sheet drawer out of the body.
  const split = contentKind !== 'longform'
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
  contentKind: 'longform' | 'outline' | 'shortform',
  current: DraftVersion,
): RawHtml {
  if (versions.length <= 1) return unsafe('');
  const kindBit =
    contentKind === 'outline'
      ? '&kind=outline'
      : contentKind === 'shortform'
        ? '&kind=shortform'
        : '';
  const links = versions
    .map((v) => {
      const isActive = v.version === current.version;
      const href = `?site=${site}${kindBit}&v=${v.version}`;
      return html`<a href="${href}" class="${isActive ? 'active' : ''}">v${v.version}</a>`;
    })
    .join('');
  return unsafe(html`<span class="er-strip-versions">${unsafe(links)}</span>`);
}

/**
 * Build the slash command that the operator pastes into Claude Code to
 * advance the workflow from its current pending state. Mirrors the
 * client-side button-handler logic so server-rendered "copy again"
 * affordances stay consistent.
 */
function pendingSkillCmd(workflow: DraftWorkflowItem): string {
  const { site, slug, contentKind, state } = workflow;
  if (state === 'iterating') {
    return contentKind === 'outline'
      ? `/deskwork:iterate --kind outline --site ${site} ${slug}`
      : `/deskwork:iterate --site ${site} ${slug}`;
  }
  if (state === 'approved') {
    // Outline-approve semantics still TBD (see editorial-review-client.ts);
    // for now both kinds emit the same /deskwork:approve.
    return `/deskwork:approve --site ${site} ${slug}`;
  }
  return '';
}

/**
 * Wrap an action button in a `.er-shortcut-chip-wrap` span carrying a
 * small chord chip beneath the button. The chord style mirrors the
 * shortcuts modal's verbatim two-tap rendering (e.g. `<kbd>a</kbd>
 * <kbd>a</kbd>` for approve) — the destructive-shortcut UX, post-#108,
 * is bare-letter double-tap (no Cmd/Ctrl modifier; verified in the
 * keybinding handler at editorial-review-client.ts).
 *
 * The chip is hidden on narrow viewports via the cross-surface CSS
 * media query — the wrap stays in the markup at every breakpoint so
 * the column flex it triggers (`.er-strip-right > *:has(.er-shortcut-chip)`)
 * is consistent with the chip's visibility state.
 *
 * Issue 5 — keyboard-shortcut chips on action buttons.
 */
function shortcutChipWrap(buttonHtml: string, letter: 'a' | 'i' | 'r'): string {
  return html`<span class="er-shortcut-chip-wrap">${unsafe(buttonHtml)}<small class="er-shortcut-chip"><kbd>${letter}</kbd><kbd>${letter}</kbd></small></span>`;
}

function renderControlsRight(workflow: DraftWorkflowItem): RawHtml {
  const isActive = workflow.state === 'open' || workflow.state === 'in-review';
  const isApproved = workflow.state === 'approved';
  const isIterating = workflow.state === 'iterating';
  const isTerminal = workflow.state === 'applied' || workflow.state === 'cancelled';
  const buttons: string[] = [];
  // Issue 7 — emit the edit-mode disclosure label next to the Edit
  // button. The client (editorial-review-client.ts) flips both the
  // `data-mode` attribute AND inner text on each toggle. Initial state
  // matches the surface's initial mode (preview).
  buttons.push(html`<button class="er-btn er-btn-small" data-action="toggle-edit" type="button">Edit</button><span class="er-edit-mode-label" data-mode="preview">preview</span>`);
  if (isActive) {
    // Issue 5 — wrap each destructive action button with its chord chip.
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

function renderError(
  slug: string,
  site: string,
  contentKind: 'longform' | 'outline' | 'shortform',
  message: string,
): string {
  const startCmd =
    contentKind === 'outline'
      ? `/deskwork:outline --site ${site} ${slug}`
      : contentKind === 'shortform'
        ? `/deskwork:shortform-start --site ${site} ${slug} <platform>`
        : `/deskwork:review-start --site ${site} ${slug}`;
  const body = html`
    <div data-review-ui="longform">
      ${renderEditorialFolio('longform', `longform · ${slug}`)}
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
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
    ],
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
          <dt><kbd>a</kbd> <kbd>a</kbd></dt><dd>approve <em>— press twice within 500ms; first press arms, second fires</em></dd>
          <dt><kbd>i</kbd> <kbd>i</kbd></dt><dd>iterate <em>— press twice within 500ms</em></dd>
          <dt><kbd>r</kbd> <kbd>r</kbd></dt><dd>reject <em>— press twice within 500ms</em></dd>
          <dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>next / previous margin note</dd>
          <dt><kbd>shift</kbd><kbd>F</kbd></dt><dd>focus mode <em>(edit mode only)</em></dd>
          <dt><kbd>shift</kbd><kbd>M</kbd></dt><dd>show / hide margin notes column <em>— or click the chevron in the head when visible, or the pull tab on the right edge when stowed</em></dd>
          <dt><kbd>?</kbd></dt><dd>this panel</dd>
          <dt><kbd>esc</kbd></dt><dd>close / cancel composer</dd>
        </dl>
        <p class="er-shortcuts-footer">Press <kbd>?</kbd> anytime.</p>
      </div>
    </div>`);
}

/* Issue #159 — marginalia stow affordance.
 *
 * The toggle for "show / hide the margin-notes column" lives ON the
 * marginalia component, not in a generic toolbar. Two paired
 * affordances drive the same state:
 *
 *   - `.er-marginalia-stow` — chevron button INSIDE the marginalia
 *     head (next to "Margin notes" label). Clicking it stows the
 *     column. Visible only when marginalia is visible (the head is
 *     inside `.er-marginalia`, which is `display: none` when stowed).
 *
 *   - `.er-marginalia-tab` — pull tab on the right edge of the
 *     viewport, mirroring `.er-outline-tab` on the left edge. Visible
 *     ONLY when marginalia is stowed (CSS rule `body[data-marginalia=
 *     "hidden"] .er-marginalia-tab { display: block }`). Clicking it
 *     unstows.
 *
 * Both affordances + Shift+M dispatch through the same client-side
 * toggleMarginalia handler. Mirrors the outline-drawer's pull-tab
 * pattern so the project's affordance vocabulary stays consistent.
 */
function renderMarginaliaTab(): RawHtml {
  return unsafe(html`
    <button class="er-marginalia-tab" data-action="toggle-marginalia" type="button" aria-pressed="true" aria-label="Show margin notes (Shift+M)" title="Show margin notes (Shift+M)">
      <span class="er-marginalia-tab-glyph" aria-hidden="true">‹</span>
      <span class="er-marginalia-tab-label">Notes</span>
    </button>`);
}

function renderMarginalia(): RawHtml {
  return unsafe(html`
    <aside class="er-marginalia" data-comments-sidebar aria-label="Margin notes">
      <p class="er-marginalia-head">
        <button class="er-marginalia-stow" data-action="toggle-marginalia" type="button" aria-pressed="false" aria-label="Hide margin notes (Shift+M)" title="Hide margin notes (Shift+M)">
          <span aria-hidden="true">›</span>
        </button>
        <span class="er-marginalia-head-label">Margin notes</span>
      </p>
      <p class="er-marginalia-empty" data-sidebar-empty>Select text in the draft to leave a <em>margin note</em>.</p>
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

/**
 * Issue #154 Dispatch C — the edit-mode chrome was previously a single
 * `.er-edit-mode` block rendered inside `.er-draft-frame` (below
 * `#draft-body`). With the page-grid in place, the natural layout is:
 *
 *   - the toolbar (Source/Split/Preview tabs + Outline/Focus/Save/
 *     Cancel actions) sticks above `.er-page`, replacing the strip's
 *     right-side action buttons;
 *   - the source/preview panes take over the article column where
 *     `#draft-body` was.
 *
 * `renderEditToolbar` emits the bar that lives ABOVE `.er-page`; the
 * client toggles its `[hidden]` attribute on enter/exit. Keeps
 * `data-edit-toolbar` on the wrapper so `editorial-review-client.ts`'s
 * existing `q('[data-edit-toolbar]')` lookup keeps working.
 */
function renderEditToolbar(outlineHasContent: boolean): RawHtml {
  const outlineBtnAttrs = outlineHasContent ? '' : ' hidden';
  return unsafe(html`
    <div class="er-edit-toolbar" data-edit-toolbar hidden>
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
    </div>`);
}

/**
 * Issue #154 Dispatch C — the source/preview panes (and supporting
 * focus-mode affordances + backing textarea) live inside the article
 * column, replacing `#draft-body`. The wrapper keeps the
 * `er-edit-mode` class so existing CSS (panes-host paper-2 background,
 * focus-mode full-viewport canvas) cascades unchanged. Adds
 * `data-edit-panes-host` so the client can flip `[hidden]` on the
 * panes wrapper independently of the toolbar.
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

/**
 * Resolve the calendar entry that backs this review surface. Callers
 * have either an `entryId` (id-canonical route) or a slug (legacy
 * route) to work with. Returns `null` when no calendar entry matches —
 * ad-hoc workflows + pre-doctor entries fall through to the slug-
 * template legacy path elsewhere.
 *
 * Failures (calendar absent, parse error) are swallowed to null so a
 * transient calendar issue never blocks the review render.
 */
function lookupReviewEntry(
  ctx: StudioContext,
  site: string,
  lookup: ReviewLookup,
  fallbackSlug: string,
): CalendarEntry | null {
  try {
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    if (!existsSync(calendarPath)) return null;
    const cal = readCalendar(calendarPath);
    if (lookup.kind === 'id') {
      const byId = findEntryById(cal, lookup.entryId);
      if (byId !== undefined) return byId;
    }
    const slug = lookup.kind === 'workflow' ? fallbackSlug : lookup.slug;
    const bySlug = findEntry(cal, slug);
    return bySlug ?? null;
  } catch {
    return null;
  }
}

export async function renderReviewPage(
  ctx: StudioContext,
  lookup: ReviewLookup,
  query: ReviewQuery,
  getIndex?: ReviewIndexGetter,
): Promise<string> {
  const queryKind = pickContentKind(query.kind ?? null);

  // Workflow-id lookup short-circuits site + entryId resolution: the
  // workflow record carries everything we need to render. Phase 21c
  // added this path so the dashboard's shortform matrix (and any other
  // surface that knows a workflow id) can deep-link to the unified
  // review surface without first knowing the calendar entry id.
  const fetched = lookup.kind === 'workflow'
    ? handleGetWorkflow(ctx.projectRoot, ctx.config, {
        id: lookup.workflowId,
        entryId: null,
        site: null,
        slug: null,
        contentKind: null,
        platform: null,
        channel: null,
      })
    : handleGetWorkflow(ctx.projectRoot, ctx.config, {
        id: null,
        entryId: lookup.kind === 'id' ? lookup.entryId : null,
        site: pickSite(ctx, query.site),
        slug: lookup.slug,
        contentKind: queryKind,
        platform: null,
        channel: null,
      });

  // Slug used in error messages and the title fallback. For
  // workflow-id lookups we don't know the slug until the fetch
  // succeeds, so use the id as a placeholder for any pre-fetch error.
  const lookupSlug =
    lookup.kind === 'workflow' ? lookup.workflowId : lookup.slug;
  // Site for the chrome / outbound links. Workflow-id lookups carry
  // their own site through the fetched workflow record.
  let resolvedSite = pickSite(ctx, query.site);

  if (fetched.status !== 200 || !isSuccessBody(fetched.body)) {
    return renderError(
      lookupSlug,
      resolvedSite,
      queryKind,
      errorFromBody(fetched.body),
    );
  }

  const { workflow, versions } = fetched.body;
  // Workflow-id paths drive contentKind from the workflow itself —
  // it's the source of truth, not the URL kind hint.
  const contentKind: 'longform' | 'outline' | 'shortform' =
    lookup.kind === 'workflow' ? workflow.contentKind : queryKind;
  if (lookup.kind === 'workflow') resolvedSite = workflow.site;
  const slug = workflow.slug;

  const requested = query.version ? parseInt(query.version, 10) : workflow.currentVersion;
  const currentVersion =
    versions.find((v) => v.version === requested) ?? versions[versions.length - 1];

  if (!currentVersion) {
    return renderError(
      slug,
      resolvedSite,
      contentKind,
      'no current version on this workflow',
    );
  }

  const { fm, bodyHtml, outlineHtml } = await prepareRender(
    currentVersion.markdown,
    contentKind,
  );

  const draftState = { workflow, currentVersion, versions };

  const titleField = stringField(fm.title) ?? `Draft: ${slug}`;

  // Phase 19c+: look up the calendar entry so the scrapbook drawer +
  // inline-text loader can resolve the on-disk scrapbook directory via
  // the content index when a frontmatter-id binding exists. Falls back
  // to slug-template addressing when no entry / no id is present.
  // Shortform skips the scrapbook drawer entirely — different surface
  // shape, no margin-note workflow.
  const reviewEntry = lookupReviewEntry(ctx, resolvedSite, lookup, slug);
  const reviewIndex = getIndex ? getIndex(resolvedSite) : undefined;
  const isShortform = contentKind === 'shortform';

  // Phase 21c — shortform header. Renders above the editor on the
  // unified review surface so the operator sees the platform (and
  // channel, if any) at a glance. Reuses existing `--er-*` design
  // tokens; no new CSS introduced.
  const shortformMeta: RawHtml = isShortform
    ? unsafe(html`
      <div class="er-shortform-meta">
        <span class="er-platform">${workflow.platform ?? 'other'}</span>
        ${workflow.channel
          ? unsafe(html`<span class="er-channel">${workflow.channel}</span>`)
          : ''}
      </div>`)
    : unsafe('');

  const reviewUiAttr = isShortform ? 'shortform' : 'longform';
  const folioSpine = isShortform
    ? `shortform · ${workflow.platform ?? '?'}${workflow.channel ? ` · ${workflow.channel}` : ''} · ${slug}`
    : `longform · ${slug}`;
  // Issue 4 — shortform reviews highlight the "Shortform" nav item;
  // longform reviews don't match any nav-item (no longform desk
  // exists). Pre-Issue-4, longform mistakenly highlighted shortform
  // because the chrome treated all review surfaces as 'reviews'.
  const folioActive: 'shortform' | 'longform' = isShortform
    ? 'shortform'
    : 'longform';

  // Issue #154 Dispatch A — `.er-page` wraps the draft frame +
  // marginalia inside a CSS Grid composition so marginalia sits next
  // to the prose it annotates rather than pinned to the viewport.
  // Shortform reviews skip the marginalia column (no margin-note
  // workflow on shortform), so the page collapses to the draft frame
  // alone for that surface — keeping the same `.er-page` shell
  // preserves the desk metaphor across longform/shortform.
  // Issue #154 Dispatch C — edit-mode panes-host lives inside the
  // article column (in place of #draft-body when editing); the
  // toolbar that drives it lives ABOVE `.er-page` (rendered below,
  // outside the grid). Shortform never enters edit mode on this
  // surface, so the panes-host is rendered but stays hidden — keeps
  // the JS hooks present for forward compatibility without flipping
  // any visible chrome.
  const pageGrid = isShortform
    ? html`
        <div class="er-page-grid">
          <div class="er-draft-frame">
            <div id="draft-body" data-draft-body
              title="Double-click to edit · select text to leave a margin note">${unsafe(bodyHtml)}</div>
            ${renderEditPanes()}
          </div>
        </div>`
    : html`
        <div class="er-page-grid">
          <div class="er-draft-frame">
            <div id="draft-body" data-draft-body
              title="Double-click to edit · select text to leave a margin note">${unsafe(bodyHtml)}</div>
            ${renderEditPanes()}
          </div>
          <div class="er-page-gutter" aria-hidden="true"></div>
          ${renderMarginalia()}
        </div>`;

  const body = html`
    <div data-review-ui="${reviewUiAttr}" class="er-review-shell">
      ${renderEditorialFolio(folioActive, folioSpine)}
      ${shortformMeta}
      <div class="er-strip">
        <div class="er-strip-inner">
          <a class="er-strip-back" href="/dev/editorial-studio" title="Back to the editorial studio">← studio</a>
          <span class="er-strip-galley">${gloss('galley')} <em>№ ${currentVersion.version}</em></span>
          <span class="er-strip-slug">${workflow.site} / ${workflow.slug}</span>
          ${renderVersionsStrip(versions, resolvedSite, contentKind, currentVersion)}
          <span class="er-strip-center">
            <span class="er-stamp er-stamp-big er-stamp-${workflow.state}" data-state-label>
              ${stateLabel(workflow.state)}
            </span>
            <span class="er-strip-hint">select text to <span class="er-gloss" data-term="marginalia" tabindex="0" role="button" aria-describedby="glossary-marginalia">mark</span> · double-click to edit · <kbd>?</kbd> for shortcuts</span>
          </span>
          ${renderControlsRight(workflow)}
        </div>
      </div>
      ${renderEditToolbar(outlineHtml.length > 0)}
      <article class="er-page">
        ${unsafe(pageGrid)}
      </article>
      ${isShortform ? unsafe('') : renderMarginaliaTab()}
      <button class="er-pencil-btn" data-add-comment-btn hidden type="button">Mark</button>
      ${isShortform ? unsafe('') : renderOutlineDrawer(outlineHtml)}
      ${isShortform
        ? unsafe('')
        : renderScrapbookDrawer(ctx, resolvedSite, reviewEntry, workflow.slug, reviewIndex)}
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
      '/static/css/scrap-row.css',
    ],
    bodyHtml: body,
    embeddedJson: [{ id: 'draft-state', data: draftState }],
    scriptModules: ['editorial-review-client'],
  });
}
