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
 *   1. loadDashboardData reads every sidecar and groups by stage.
 *   2. Each stage renders via `renderStageSection`.
 *   3. The Distribution placeholder renders below the stage sections.
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
import { loadDashboardData, DASHBOARD_STAGE_ORDER } from './dashboard/data.ts';
import {
  renderStageSection,
  renderDistributionPlaceholder,
} from './dashboard/section.ts';
import { renderHeader, renderFilterStrip } from './dashboard/header.ts';
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
 */
export async function renderDashboard(
  ctx: StudioContext,
  getIndex?: DashboardIndexGetter,
): Promise<string> {
  // Touch the parameter so the unused-param check stays satisfied.
  void getIndex;

  const data = await loadDashboardData(ctx.projectRoot);
  const now = ctx.now ? ctx.now() : new Date();

  const defaultSite = ctx.config.defaultSite;
  const stageSections = DASHBOARD_STAGE_ORDER.map((stage) => {
    const bucket = data.byStage.get(stage) ?? [];
    return renderStageSection(stage, bucket, defaultSite).__raw;
  }).join('\n');

  // The press queue (right-rail on desktop) was removed in v0.19
  // per DESKWORK-STATE-MACHINE.md Commandment III — its primary
  // purpose was surfacing review-state, which is RETIRED. The
  // archive entry at docs/studio-design/ACCEPTED/2026-05-09-press-queue-removed/
  // captures the rationale.
  const body = html`
  ${renderEditorialFolio('dashboard', 'press-check')}
  ${renderHeader(data, ctx.projectRoot, now)}
  <main class="er-container">
    ${renderFilterStrip()}
    ${unsafe(stageSections)}
    ${renderDistributionPlaceholder()}
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
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    scriptModules: ['editorial-studio-client'],
  });
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
