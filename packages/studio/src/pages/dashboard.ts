/**
 * Studio dashboard page — `/dev/editorial-studio`.
 *
 * The dashboard renders eight stage sections — Ideas → Planned →
 * Outlining → Drafting → Final → Published, plus Blocked and
 * Cancelled — backed by sidecar reads under
 * `<projectRoot>/.deskwork/entries/*.json`, with a Distribution
 * placeholder pinned at the end. Each row carries the entry's slug,
 * title, updated-at timestamp, and stage-gated verb buttons that
 * clipboard-copy `/deskwork:<verb> <slug>` (THESIS Consequence 2 —
 * the studio routes commands; skills do the work). On phone (≤600px)
 * each stage section is collapsed by default and fronted by a tile
 * (see Compact-1 in DESIGN-STANDARDS.md); on desktop everything is
 * expanded with the existing `<h2 class="er-section-head">` heading
 * carrying the stage name.
 *
 * Per DESKWORK-STATE-MACHINE.md (Commandment III), reviewState is
 * RETIRED. Rows do NOT carry per-stage iteration counts or
 * reviewState badges; that legacy "at-a-glance" surfacing was
 * removed in v0.19.
 *
 * The renderer's data flow:
 *   1. loadDashboardData reads every sidecar and groups by lane and by
 *      stage.
 *   2. The multi-lane swimlane shell (Phase 5 Task 5.1+) renders one
 *      swimlane per focused lane; per-stage columns and rows come from
 *      the lane's resolved pipeline template.
 *   3. The Distribution placeholder renders below the swimlane shell.
 *   4. The mobile-only Compose chrome (FAB + slide-up sheet) renders
 *      at the page tail; CSS hides it on desktop.
 *
 * `getIndex` is preserved for signature compatibility with the
 * override resolver in server.ts; the dashboard does not consume it
 * (sidecars are the data source, not the on-disk content tree).
 */

import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';
import { renderMasthead } from './masthead.ts';
import { renderMastheadMenu } from './masthead-menu.ts';
import { loadDashboardData } from './dashboard/data.ts';
import { renderDistributionPlaceholder } from './dashboard/section.ts';
import { renderHeader, renderFilterStrip } from './dashboard/header.ts';
import { renderShortformSection } from './dashboard/shortform-section.ts';
import { renderAdjacentSection } from './dashboard/adjacent-section.ts';
import {
  renderSwimlanesShell,
  parseFocusCsv,
} from './dashboard/swimlane-shell.ts';
import type { ContentIndex } from '@deskwork/core/content-index';

/**
 * Per-request content-index getter. Preserved for compatibility with
 * `runTemplateOverride` in server.ts — the override resolver calls
 * the dashboard with `(ctx, getIndex)` and we keep the signature
 * symmetric. Sidecar-driven rendering does not consume it directly.
 */
export type DashboardIndexGetter = (site: string) => ContentIndex;

/**
 * Render the studio dashboard. Async because sidecar reads hit disk;
 * the route handler in server.ts awaits the result before sending it.
 *
 * Phase 5 Task 5.1: the eight-stage `<section>` loop was replaced by
 * the multi-lane swimlane shell (Direction 3 Press Bay v11). The
 * shortform + adjacent sections render BELOW the bay shell as siblings
 * (per ambiguity resolution 2 — Distribution renders inside the
 * swimlanes when a lane's template lists it, no longer as a separate
 * top-level section). The legacy `DASHBOARD_STAGE_ORDER` constant
 * stays in `./dashboard/data.ts` as a back-compat read view for the
 * `data.byStage` map; production rendering reads `data.lanes` instead.
 *
 * @param requestUrl - The full request URL (e.g. `c.req.url` from
 *   Hono). Used to parse the `?focus=<csv>` query param into a
 *   server-side focus filter. When absent, the dashboard server-
 *   renders every lane as focused and lets the client controller
 *   apply localStorage afterwards.
 */
export async function renderDashboard(
  ctx: StudioContext,
  getIndex?: DashboardIndexGetter,
  requestUrl?: string,
): Promise<string> {
  // Touch the parameter so the unused-param check stays satisfied.
  void getIndex;

  const data = await loadDashboardData(ctx.projectRoot, ctx.config);
  const now = ctx.now ? ctx.now() : new Date();

  const defaultSite = ctx.config.defaultSite;

  // Phase 5 Task 5.1: emit the bay shell (one swimlane per focused
  // lane). Per Commandment II of DESKWORK-STATE-MACHINE.md, stage
  // labels come from each lane's template — no hardcoded
  // "Drafting" / "Published" anywhere in this render path.
  const focusFromUrl = parseFocusFromRequest(requestUrl);
  const swimlanes = renderSwimlanesShell({
    lanes: data.lanes,
    defaultSite,
    projectRoot: ctx.projectRoot,
    focusFromUrl,
  });

  // v7 architecture (Step 2.2.9 — studio-mobile-first): the Desk absorbs
  // the Shortform-by-platform view as its second section, plus reserved
  // Adjacent-tools placeholders for Phase 3+ Folio + Files surfaces. Per
  // the v7 mockup at desk-states-v7.html:563, the masthead meta reads
  // "${longformCount} longform · ${shortformCount} shortform" when any
  // shortform workflows exist; otherwise it falls back to longform-only
  // to avoid a misleading "0 shortform" claim.
  const longformCount = data.entries.length;
  const shortformCount = data.shortformWorkflows.length;
  const mastheadMeta =
    shortformCount > 0
      ? `${longformCount} longform · ${shortformCount} shortform`
      : `${longformCount} longform`;
  const masthead = renderMasthead({
    kicker: "The compositor's desk",
    title: 'Pipeline + Press.',
    metaInline: mastheadMeta,
    isHub: true,
  });

  // The press queue (right-rail on desktop) was removed in v0.19
  // per DESKWORK-STATE-MACHINE.md Commandment III — its primary
  // purpose was surfacing review-state, which is RETIRED. The
  // archive entry at docs/studio-design/ACCEPTED/2026-05-09-press-queue-removed/
  // captures the rationale.
  const shortformSection = renderShortformSection(
    {
      shortformByPlatform: data.shortformByPlatform,
      totalCount: shortformCount,
    },
    now,
  );
  const adjacentSection = renderAdjacentSection();

  // Per ambiguity resolution 2 (Task 5.1): the shortform + adjacent
  // sections render BELOW the new bay shell as siblings. The
  // Distribution placeholder remains a top-level sibling because no
  // lane template currently lists "Distribution" as a stage — if a
  // future template does, the swimlanes will render it inline and a
  // separate placeholder commit retires the top-level sibling.
  const body = html`
  ${masthead}
  ${renderMastheadMenu()}
  ${renderEditorialFolio('dashboard', 'press-check')}
  ${renderHeader(data, ctx.projectRoot, now)}
  <main class="er-container">
    ${renderFilterStrip()}
    ${swimlanes}
    ${renderDistributionPlaceholder()}
    ${shortformSection}
    ${adjacentSection}
  </main>
  ${renderComposeChrome()}
  <div class="er-toast" data-toast hidden></div>
  <div class="er-poll-indicator" data-poll>auto-refresh · 10s</div>`;

  return layout({
    title: 'Press-Check — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-studio.css',
      '/static/css/dashboard-mobile.css',
      '/static/css/dashboard-desk-sections.css',
      '/static/css/dashboard-row-affordances.css',
      '/static/css/dashboard-swimlane-shell.css',
      '/static/css/dashboard-swimlane-rail.css',
      '/static/css/dashboard-swimlane-presets.css',
      '/static/css/dashboard-swimlane-chips.css',
      '/static/css/dashboard-swimlane-collapse.css',
      '/static/css/dashboard-swimlane-list.css',
      '/static/css/dashboard-swimlane-compose.css',
      '/static/css/dashboard-swimlane-drag.css',
      '/static/css/dashboard-swimlane-mobile.css',
      '/static/css/dashboard-lane-stack.css',
      '/static/css/mobile-shell.css',
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    scriptModules: ['editorial-studio-client'],
  });
}

/**
 * Parse the `?focus=<csv>` query parameter from a request URL.
 * Returns null when the parameter is missing or empty so the caller
 * can distinguish "URL did not specify focus" from "URL specified
 * an empty focus set."
 */
function parseFocusFromRequest(requestUrl: string | undefined): readonly string[] | null {
  if (requestUrl === undefined) return null;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestUrl);
  } catch {
    // Malformed URL — treat as "no override" rather than throwing.
    // The dashboard's render path should never crash because a route
    // handler handed it a string the URL parser can't accept.
    return null;
  }
  return parseFocusCsv(parsedUrl.searchParams.get('focus'));
}

/**
 * Mobile-only Compose chrome — a floating "+ Compose" chip at bottom-right
 * and a slide-up sheet listing creation verbs. The chip and sheet are
 * `display: none` on desktop (see dashboard-mobile.css); on phone the
 * chip is the operator's primary path to /deskwork:add, /deskwork:ingest,
 * and /deskwork:shortform-start.
 *
 * Each verb card is a `<button data-compose-verb data-copy="...">`. The
 * client-side controller in `dashboard/compose-chip.ts` handles the
 * clipboard write via copyOrShowFallback (THESIS Consequence 2 — agent
 * does the work; the studio routes intent). We deliberately do NOT use
 * the existing `.er-copy-btn` class on these buttons because that class
 * triggers a textContent swap on success, which would clobber the rich
 * verb-card markup; the compose-chip controller handles feedback via a
 * `.is-copied` class instead.
 */
function renderComposeChrome(): RawHtml {
  return unsafe(html`
  <button class="er-compose-fab" data-compose-fab type="button" aria-controls="er-compose-sheet" aria-expanded="false">
    <span class="er-compose-fab-glyph" aria-hidden="true">+</span>
    <span class="er-compose-fab-label">Compose</span>
  </button>
  <section
    class="er-compose-sheet"
    id="er-compose-sheet"
    data-compose-sheet
    hidden
    role="dialog"
    aria-modal="false"
    aria-label="Compose creation verbs"
  >
    <div class="er-compose-scrim" data-compose-scrim></div>
    <div class="er-compose-panel">
      <button class="er-compose-handle" data-compose-handle type="button" aria-label="Drag to dismiss compose sheet">
        <span class="er-compose-handle-bar" aria-hidden="true"></span>
      </button>
      <header class="er-compose-head">
        <span class="er-compose-kicker">+ Compose · creation verbs</span>
        <span class="er-compose-meta">tap copies the command</span>
        <button class="er-compose-close" data-compose-close type="button" aria-label="Close compose sheet">×</button>
      </header>
      <div class="er-compose-body">
        <button class="er-compose-verb" data-compose-verb data-copy="/deskwork:add" type="button">
          <span class="er-compose-verb-head">
            <span class="er-compose-verb-glyph" aria-hidden="true">+</span>
            <span class="er-compose-verb-name">New idea</span>
            <span class="er-compose-verb-cmd">/deskwork:add</span>
          </span>
          <span class="er-compose-verb-desc">Capture a new pitch as an Ideas-stage entry. Scaffolds an idea.md with sidecar; the agent picks up from there.</span>
          <span class="er-compose-verb-foot">tap → clipboard · paste in Claude Code</span>
        </button>
        <button class="er-compose-verb" data-compose-verb data-copy="/deskwork:ingest" type="button">
          <span class="er-compose-verb-head">
            <span class="er-compose-verb-glyph" aria-hidden="true">⤓</span>
            <span class="er-compose-verb-name">Ingest existing</span>
            <span class="er-compose-verb-cmd">/deskwork:ingest</span>
          </span>
          <span class="er-compose-verb-desc">Backfill markdown that already exists on disk. Walks files / globs, derives slug + state + date, and (after dry-run) writes calendar rows.</span>
          <span class="er-compose-verb-foot">tap → clipboard · paste in Claude Code</span>
        </button>
        <button class="er-compose-verb" data-compose-verb data-copy="/deskwork:shortform-start" type="button">
          <span class="er-compose-verb-head">
            <span class="er-compose-verb-glyph" aria-hidden="true">⊜</span>
            <span class="er-compose-verb-name">Shortform start</span>
            <span class="er-compose-verb-cmd">/deskwork:shortform-start</span>
          </span>
          <span class="er-compose-verb-desc">Start a LinkedIn / Reddit / YouTube / Instagram draft for a Published or Drafting entry. Same review pipeline as longform.</span>
          <span class="er-compose-verb-foot">tap → clipboard · paste in Claude Code</span>
        </button>
      </div>
    </div>
  </section>`);
}
