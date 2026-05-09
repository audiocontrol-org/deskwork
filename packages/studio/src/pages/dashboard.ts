/**
 * Studio dashboard page — `/dev/editorial-studio`.
 *
 * Pipeline-redesign Task 34. The dashboard renders eight stage
 * sections — Ideas → Planned → Outlining → Drafting → Final →
 * Published, plus Blocked and Cancelled — backed by sidecar reads
 * under `<projectRoot>/.deskwork/entries/*.json`. Each row carries
 * the entry's iteration count for its current stage and a
 * reviewState badge so an operator can see at a glance where each
 * entry sits without opening it.
 *
 * Replaces the legacy calendar.md + workflow store rendering. The
 * scaffold (folio, masthead, filter strip, layout) is preserved so
 * existing CSS keeps working.
 *
 * The renderer's data flow:
 *   1. loadDashboardData reads every sidecar and groups by stage.
 *   2. Each of the eight stages renders via `renderStageSection`.
 *   3. The Distribution placeholder pins beneath the stage sections.
 *
 * The legacy export `renderDashboard` stays — server.ts wires it as
 * the page handler. The `getIndex` parameter is preserved for
 * signature compatibility with the override resolver in server.ts;
 * the new dashboard does not currently consume it (sidecars are the
 * data source, not the on-disk content tree).
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

  // Review-state-driven press queue (right-rail on desktop) was removed
  // in v0.19 per operator: review state is being phased out and the
  // press queue exists solely to surface review-state-derived "needs
  // your eyes" entries. Without that signal, the queue has nothing to
  // say. The .er-layout wrapper stays in place for now in case the
  // right column reappears with a non-review-state surface later.
  const body = html`
  ${renderEditorialFolio('dashboard', 'press-check')}
  ${renderHeader(data, ctx.projectRoot, now)}
  <main class="er-container">
    ${renderFilterStrip()}
    <div class="er-layout">
      <div>
        ${unsafe(stageSections)}
        ${renderDistributionPlaceholder()}
      </div>
    </div>
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
