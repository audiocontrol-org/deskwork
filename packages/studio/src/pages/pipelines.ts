/**
 * Studio pipeline-editor page — `/dev/pipelines` (Phase 6 Task 6.4).
 *
 * Server-renders the project's pipeline registry: every plugin-preset
 * and project-override template in a primary table, with per-row View
 * (stage flow visualization), Edit (5-operation accordion), and
 * Delete (clipboard or disabled-with-explanation). Above the table a
 * "New pipeline template" copy-builder form composes the equivalent
 * `/deskwork:pipeline create` slash command.
 *
 * Per THESIS Consequence 2, this page never mutates state. Every
 * action button — Copy command, View, Edit-op Copy, Delete — is a
 * clipboard-copy of the equivalent `/deskwork:pipeline <verb>` slash
 * command. The studio's job is to route the operator's intent into a
 * paste-ready command with the right arguments pre-filled.
 *
 * Per the Phase 2 follow-up captured in the workplan, the data layer
 * surfaces malformed override JSON as error rows rather than
 * silently filtering — so the operator sees "this id exists but
 * won't load — fix this file" rather than "this id is missing." A
 * top-of-page banner names the count + affected ids.
 *
 * Page structure (mirrors the lanes-page shape):
 *
 *   - Editorial folio (cross-page nav strip)
 *   - Masthead ("Pipelines" title + lane-binding meta + back link)
 *   - Main container
 *     - Header (page heading + count meta + integrity banner)
 *     - New template form
 *     - Pipeline table (healthy rows + error rows)
 *   - Toast slot (success / fallback panel)
 *
 * The page loads the `editorial-studio-client` bundle for the
 * cross-cutting affordances (folio nav state, masthead popover, copy
 * vocabulary) and `pipelines-page.css` for the page-specific chrome.
 * The pipeline-page client controller lives inside the same bundle
 * as `initPipelinesPage`, registered alongside `initLanesPage`.
 */

import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';
import { renderMasthead } from './masthead.ts';
import { renderMastheadMenu } from './masthead-menu.ts';
import {
  loadPipelinesPageData,
  type PipelinesPageData,
} from './pipelines/data.ts';
import { renderPipelineTable } from './pipelines/table.ts';
import { renderNewPipelineForm } from './pipelines/new-form.ts';
import { renderErrorBanner } from './pipelines/error-banner.ts';

export async function renderPipelinesPage(ctx: StudioContext): Promise<string> {
  const data = await loadPipelinesPageData(ctx.projectRoot);

  const masthead = renderMasthead({
    kicker: 'Pipeline registry',
    title: 'Pipelines',
    metaInline: pipelinesMastheadMeta(data),
    isHub: false,
  });

  const header = renderHeader(data);
  const newForm = renderNewPipelineForm();
  const errorBanner = renderErrorBanner(data.errors);
  const availableTemplates = [...data.rows.map((r) => r.id)].sort();
  const table = renderPipelineTable({
    rows: data.rows,
    errors: data.errors,
    availableTemplates,
  });

  const body = html`
    ${masthead}
    ${renderMastheadMenu()}
    ${renderEditorialFolio('dashboard', 'the pipeline registry')}
    <main class="er-container pipelines-container" data-pipelines-container>
      ${header}
      ${errorBanner}
      ${newForm}
      <section class="pipelines-table-section" aria-labelledby="pipelines-table-heading">
        <h2 class="pipelines-section-heading" id="pipelines-table-heading">Templates</h2>
        ${table}
      </section>
    </main>
    <div class="er-toast" data-toast hidden></div>`;

  return layout({
    title: 'Pipelines — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-studio.css',
      '/static/css/pipelines-page.css',
      '/static/css/pipelines-stage-flow.css',
    ],
    bodyAttrs: 'data-review-ui="pipelines"',
    bodyHtml: body,
    scriptModules: ['editorial-studio-client'],
  });
}

function pipelinesMastheadMeta(data: PipelinesPageData): string {
  const healthy = data.rows.length;
  const errorFragment =
    data.errors.length > 0 ? ` · ${data.errors.length} error${data.errors.length === 1 ? '' : 's'}` : '';
  const noun = data.totalLanes === 1 ? 'lane' : 'lanes';
  return `${healthy} template${healthy === 1 ? '' : 's'}${errorFragment} · ${data.totalLanes} ${noun}`;
}

function renderHeader(data: PipelinesPageData): RawHtml {
  const counts =
    data.errors.length === 0
      ? ''
      : unsafe(html`
        <span class="pipelines-header-warn" role="status">
          ${data.errors.length} template${unsafe(data.errors.length === 1 ? '' : 's')} failed to load — fix the offending JSON before running update / delete.
        </span>`);
  return unsafe(html`
    <header class="er-pagehead pipelines-header" data-pipelines-header>
      <p class="er-pagehead__kicker">Pipeline registry</p>
      <h1 class="er-pagehead__title">Pipelines</h1>
      <p class="er-pagehead__deck">
        Pipeline templates name the stages a lane's entries flow through.
        Every action on this page copies the equivalent
        <code>/deskwork:pipeline</code> command to your clipboard —
        paste into Claude Code to run.
      </p>
      ${counts}
    </header>`);
}
