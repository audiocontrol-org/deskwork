/**
 * Top-level renderer for the entry-keyed press-check surface
 * (Phase 34a Layer 2 — `/dev/editorial-review/entry/<uuid>`).
 *
 * Wires every chrome component (folio, version strip, edit toolbar,
 * edit panes, outline drawer, marginalia column + tab, decision strip,
 * scrapbook drawer, shortcuts overlay, rendered preview) against the
 * entry-keyed Layer 1 data layer (sidecar + history-journal iterations
 * + entry-keyed annotations).
 *
 * The relocated chrome shares the existing `editorial-review.css`
 * stylesheet with the legacy longform surface — the chrome IS the
 * existing chrome being relocated. The body data attribute is
 * `data-review-ui="longform"` so the existing `er-*` rules in
 * editorial-review.css cascade correctly.
 *
 * `entry-review.css` (the existing per-stage controller stylesheet)
 * stays linked because the 404 not-found variant + future per-entry
 * affordance polish lives there. The two class families coexist —
 * `.er-*` from the relocated chrome and `.er-entry-*` from the stage
 * controller — without collision.
 *
 * The StudioContext threads through so the scrapbook drawer can
 * resolve the entry's site + content index (per-request memoized via
 * `getRequestContentIndex`).
 */

import { existsSync } from 'node:fs';
import {
  parseDraftFrontmatter,
  renderMarkdownToHtml,
} from '@deskwork/core/review/render';
import { splitOutline } from '@deskwork/core/outline-split';
import type { ContentIndex } from '@deskwork/core/content-index';
import { resolveCalendarPath } from '@deskwork/core/paths';
import { readCalendar } from '@deskwork/core/calendar';
import { findEntryById } from '@deskwork/core/calendar-mutations';
import type { CalendarEntry } from '@deskwork/core/types';
import { getAffordances } from '../../lib/stage-affordances.ts';
import type { StudioContext } from '../../routes/api.ts';
import { html, unsafe, escapeHtml, gloss, type RawHtml } from '../html.ts';
import { layout } from '../layout.ts';
import { renderEditorialFolio } from '../chrome.ts';
import { renderScrapbookDrawer } from '../review-scrapbook-drawer.ts';
import { loadEntryReviewData, type EntryReviewData } from './data.ts';
import { renderVersionsStrip } from './version-strip.ts';
import { renderEditToolbar } from './edit-toolbar.ts';
import { renderEditPanes } from './edit-panes.ts';
import { renderOutlineDrawer } from './outline-drawer.ts';
import { renderMarginalia, renderMarginaliaTab } from './marginalia.ts';
import { renderDecisionStrip } from './decision-strip.ts';
import { renderShortcutsOverlay } from './shortcuts.ts';
import { renderEntryNotFound } from './not-found.ts';

export type EntryReviewIndexGetter = (site: string) => ContentIndex;

export interface EntryReviewQuery {
  /** `?v=<n>` from the request URL. When set + resolves, shows that
   *  iteration's historical content read-only. */
  readonly version?: string | null;
  /** `?stage=<Stage>` from the request URL. Disambiguates historical
   *  lookup when an entry has the same version number recorded under
   *  multiple stages. Optional; omitted falls back to the first
   *  chronological match (single-stage case). */
  readonly stage?: string | null;
}

export interface EntryReviewResult {
  status: 200 | 404;
  html: string;
}

interface PreparedRender {
  readonly fm: Record<string, unknown>;
  readonly bodyHtml: string;
  readonly outlineHtml: string;
}

function stringField(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Prepare the article body + the optional outline drawer content. Mirrors
 * `pages/review.ts:prepareRender` but without the workflow-keyed
 * contentKind switch — the entry-keyed surface is always longform-shaped
 * (shortform stays on its own retirement track).
 */
async function prepareRender(markdown: string): Promise<PreparedRender> {
  const parsed = parseDraftFrontmatter(markdown);
  const fm = parsed.frontmatter;

  const split = splitOutline(parsed.body);
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

/**
 * Build the embedded JSON state the client (`entry-review-client.ts`)
 * needs to wire margin-note authoring + decision actions + version
 * polling. The shape mirrors the legacy `draft-state` payload but is
 * keyed on entryId rather than workflowId.
 */
interface EntryReviewState {
  readonly entryId: string;
  readonly slug: string;
  readonly site: string;
  readonly currentStage: string;
  readonly currentVersion: number | null;
  /** Markdown of the version actively rendered (current or historical). */
  readonly markdown: string;
  /** True when the renderer is showing a historical iteration (read-only). */
  readonly historical: boolean;
}

function buildState(data: EntryReviewData): EntryReviewState {
  const stage = data.entry.currentStage;
  const currentVersion = data.entry.iterationByStage[stage] ?? null;
  return {
    entryId: data.entry.uuid,
    slug: data.entry.slug,
    site: data.site,
    currentStage: stage,
    currentVersion,
    markdown: data.markdown,
    historical: data.historical !== null,
  };
}

/**
 * The entry's site, surfaced through the `EntryReviewData` resolver,
 * may not match the calendar entry shape the scrapbook drawer expects
 * — the drawer accepts a CalendarEntry-shaped object directly. When the
 * entry is found in a configured calendar, we pass it through; otherwise
 * the drawer falls back to slug-template path resolution.
 */
function lookupCalendarEntryStrict(
  ctx: StudioContext,
  site: string,
  entryId: string,
): CalendarEntry | null {
  try {
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    if (!existsSync(calendarPath)) return null;
    const cal = readCalendar(calendarPath);
    const found = findEntryById(cal, entryId);
    return found ?? null;
  } catch {
    return null;
  }
}

/**
 * Render the entry-keyed press-check surface for `entryId`. Returns a
 * 404 shell when the sidecar can't be resolved; otherwise renders the
 * full press-check chrome backed by Layer 1's data layer.
 */
export async function renderEntryReviewPage(
  ctx: StudioContext,
  entryId: string,
  query: EntryReviewQuery = {},
  getIndex?: EntryReviewIndexGetter,
): Promise<EntryReviewResult> {
  let data: EntryReviewData;
  try {
    data = await loadEntryReviewData(ctx, entryId, {
      version: query.version ?? null,
      stage: query.stage ?? null,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 404, html: renderEntryNotFound(entryId, reason) };
  }

  const { fm, bodyHtml, outlineHtml } = await prepareRender(data.markdown);
  const affordances = getAffordances(data.entry);
  const state = buildState(data);
  const titleField = stringField(fm.title) ?? `Draft: ${data.entry.slug}`;

  // Calendar-entry lookup for the scrapbook drawer. The data loader
  // already attempted this; we re-derive the strict CalendarEntry here
  // because the drawer's signature wants the wider type.
  const reviewEntry = data.calendarEntry !== null
    ? data.calendarEntry
    : lookupCalendarEntryStrict(ctx, data.site, entryId);
  const reviewIndex = getIndex ? getIndex(data.site) : undefined;

  // Pick a folio spine label that names the entry concisely. The
  // legacy surface used `longform · <slug>`; preserve it so the
  // visual signature stays continuous with the existing chrome.
  const folioSpine = `longform · ${data.entry.slug}`;
  const stageLabel = data.entry.currentStage;
  const historicalBadge = data.historical
    ? unsafe(html`<span class="er-strip-historical" title="Historical version (read-only)">historical · v${data.historical.versionNumber}</span>`)
    : unsafe('');

  // The page-grid composes the article column + the marginalia rail.
  // Mirrors the legacy longform layout (`.er-page-grid` with the
  // `.er-draft-frame` + `.er-page-gutter` + `.er-marginalia` triplet).
  const pageGrid = html`
    <div class="er-page-grid">
      <div class="er-draft-frame">
        <div id="draft-body" data-draft-body
          title="Double-click to edit · select text to leave a margin note">${unsafe(bodyHtml)}</div>
        ${renderEditPanes()}
      </div>
      <div class="er-page-gutter" aria-hidden="true"></div>
      ${renderMarginalia()}
    </div>`;

  const scrapbookDrawer: RawHtml = renderScrapbookDrawer(
    ctx,
    data.site,
    reviewEntry,
    data.entry.slug,
    reviewIndex,
  );

  const versionStrip = renderVersionsStrip({
    iterations: data.iterations,
    entry: data.entry,
    historicalVersion: data.historical?.versionNumber ?? null,
    historicalStage: data.historical?.stage ?? null,
  });

  const decisionStrip = renderDecisionStrip({
    entry: data.entry,
    affordances,
    historical: data.historical !== null,
  });

  const body = html`
    <div data-review-ui="longform" class="er-review-shell">
      ${renderEditorialFolio('longform', folioSpine)}
      <div class="er-strip">
        <div class="er-strip-inner">
          <a class="er-strip-back" href="/dev/editorial-studio" title="Back to the editorial studio">← studio</a>
          <span class="er-strip-galley">${gloss('galley')} <em>№ ${state.currentVersion ?? '—'}</em></span>
          <span class="er-strip-slug">${data.site} / ${data.entry.slug}</span>
          ${versionStrip}
          <span class="er-strip-center">
            <span class="er-stamp er-stamp-big er-stamp-${stageLabel.toLowerCase()}" data-state-label data-stage="${stageLabel}">
              ${stageLabel}
            </span>
            ${historicalBadge}
            <span class="er-strip-hint">select text to <span class="er-gloss" data-term="marginalia" tabindex="0" role="button" aria-describedby="glossary-marginalia">mark</span> · double-click to edit · <kbd>?</kbd> for shortcuts</span>
          </span>
          ${decisionStrip}
        </div>
      </div>
      ${renderEditToolbar(outlineHtml.length > 0)}
      <article class="er-page" data-entry-uuid="${data.entry.uuid}">
        ${unsafe(pageGrid)}
      </article>
      ${renderMarginaliaTab()}
      <button class="er-pencil-btn" data-add-comment-btn hidden type="button">Mark</button>
      ${renderOutlineDrawer(outlineHtml)}
      ${scrapbookDrawer}
      <div class="er-toast" data-toast hidden></div>
      ${renderShortcutsOverlay()}
      <div class="er-poll-indicator" data-poll>auto-refresh · 8s</div>
    </div>`;

  return {
    status: 200,
    html: layout({
      title: `${titleField} — Review`,
      cssHrefs: [
        '/static/css/editorial-review.css',
        '/static/css/editorial-nav.css',
        '/static/css/entry-review.css',
        '/static/css/blog-figure.css',
        '/static/css/review-viewport.css',
        '/static/css/scrap-row.css',
      ],
      bodyAttrs: 'data-review-ui="entry-review"',
      bodyHtml: body,
      embeddedJson: [{ id: 'entry-review-state', data: state }],
      scriptModules: ['entry-review-client'],
    }),
  };
}
