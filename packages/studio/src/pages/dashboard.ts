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
import { html, unsafe } from './html.ts';
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

  const stageSections = DASHBOARD_STAGE_ORDER.map((stage) => {
    const bucket = data.byStage.get(stage) ?? [];
    return renderStageSection(stage, bucket).__raw;
  }).join('\n');

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
  <div class="er-toast" data-toast hidden></div>
  <div class="er-poll-indicator" data-poll>auto-refresh · 10s</div>`;

  return layout({
    title: 'Editorial Studio — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-studio.css',
    ],
    bodyAttrs: 'data-review-ui="studio"',
    bodyHtml: body,
    scriptModules: ['editorial-studio-client'],
  });
}
