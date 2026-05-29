/**
 * Studio lane-management page — `/dev/lanes` (Phase 6 Task 6.3).
 *
 * Server-renders the project's lane registry: active lanes in a
 * primary table, archived lanes in a collapse-by-default section,
 * plus a "New lane" copy-builder form.
 *
 * Per THESIS Consequence 2, this page never mutates sidecar state.
 * Every action button — Edit, Archive, Restore, Purge, Copy command —
 * is a clipboard-copy of the equivalent `/deskwork:lane <verb>`
 * slash command. The operator pastes the command into Claude Code;
 * the agent runs the CLI; the CLI writes the sidecar. The studio's
 * job is to route the operator's intent into a paste-ready command
 * with the right arguments pre-filled.
 *
 * Page structure (mirrors the dashboard pattern):
 *
 *   - Editorial folio (cross-page nav strip)
 *   - Mobile masthead (hub-shape — "Lanes" title + "the compositor's
 *     desk" kicker; back-link to /dev/editorial-studio)
 *   - Main container
 *     - Header (page heading + count meta + integrity warning if
 *       any unrouted entries)
 *     - New Lane form
 *     - Active lanes table (or empty-state CTA)
 *     - Archived lanes section
 *   - Toast slot (success / fallback panel)
 *
 * The page registers `editorial-studio-client` as a script module
 * because the existing client carries the `[data-lanes-*]` handlers
 * (added alongside this page). Loading the same bundle keeps the
 * folio nav active state, the masthead popover, and the existing
 * copy-button vocabulary consistent across the studio.
 */

import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';
import { renderMasthead } from './masthead.ts';
import { renderMastheadMenu } from './masthead-menu.ts';
import { loadLanesPageData, type LanesPageData } from './lanes/data.ts';
import { renderLaneTable } from './lanes/table.ts';
import { renderNewLaneForm } from './lanes/new-form.ts';
import { renderArchivedSection } from './lanes/archived-section.ts';

export async function renderLanesPage(ctx: StudioContext): Promise<string> {
  const data = await loadLanesPageData(ctx.projectRoot);

  const masthead = renderMasthead({
    kicker: "The compositor's desk",
    title: 'Lanes',
    metaInline: lanesMastheadMeta(data),
    isHub: false,
  });

  const header = renderHeader(data);
  const newForm = renderNewLaneForm({
    availableTemplates: data.availableTemplates,
  });
  const activeTable =
    data.active.length === 0
      ? renderEmptyActiveState()
      : renderLaneTable({
          rows: data.active,
          availableTemplates: data.availableTemplates,
          emptyMessage: 'No active lanes.',
          tableLabel: 'Active lanes',
          archivedTable: false,
        });
  const archivedSection = renderArchivedSection({
    rows: data.archived,
    availableTemplates: data.availableTemplates,
  });

  const body = html`
    ${masthead}
    ${renderMastheadMenu()}
    ${renderEditorialFolio('dashboard', "the compositor's desk")}
    <main class="er-container lanes-container" data-lanes-container>
      ${header}
      ${newForm}
      <section class="lanes-active" data-lanes-active aria-labelledby="lanes-active-heading">
        <h2 class="lanes-active-heading" id="lanes-active-heading">Active lanes</h2>
        ${activeTable}
      </section>
      ${archivedSection}
    </main>
    <div class="er-toast" data-toast hidden></div>`;

  return layout({
    title: 'Lanes — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-studio.css',
      '/static/css/lanes-page.css',
    ],
    bodyAttrs: 'data-review-ui="lanes"',
    bodyHtml: body,
    scriptModules: ['editorial-studio-client'],
  });
}

function lanesMastheadMeta(data: LanesPageData): string {
  const activeCount = data.active.length;
  const archivedCount = data.archived.length;
  const archivedFragment =
    archivedCount > 0 ? ` · ${archivedCount} archived` : '';
  return `${activeCount} active${archivedFragment} · ${data.totalEntries} entries`;
}

function renderHeader(data: LanesPageData): RawHtml {
  const unroutedBadge =
    data.unroutedEntries > 0
      ? unsafe(html`
        <span class="lanes-header-warn" role="status">
          ${data.unroutedEntries} unrouted entr${unsafe(data.unroutedEntries === 1 ? 'y' : 'ies')} — check <code>/deskwork:doctor</code> for binding repair.
        </span>`)
      : '';

  return unsafe(html`
    <header class="er-pagehead lanes-header" data-lanes-header>
      <p class="er-pagehead__kicker">Lane registry</p>
      <h1 class="er-pagehead__title">Lanes</h1>
      <p class="er-pagehead__deck">
        Each lane binds a content directory to a pipeline template.
        Every action on this page copies the equivalent <code>/deskwork:lane</code>
        command to your clipboard — paste into Claude Code to run.
      </p>
      ${unroutedBadge}
    </header>`);
}

/**
 * Empty-state for the active table — no lanes configured at all.
 * Renders a prominent "Create your first lane" CTA pointed at the
 * New Lane form (which is rendered above in the page body).
 *
 * The CTA carries both a `href="#lanes-new-form-heading"` anchor
 * (no-JS fallback that scrolls to the form heading) AND a
 * `data-lanes-cta-focus` attribute the client controller hooks. On
 * click with JS available, the client intercepts the anchor and
 * focuses the first field of the New Lane form instead — the
 * operator's intent on click is "let me start typing," not "scroll
 * me there."
 */
function renderEmptyActiveState(): RawHtml {
  return unsafe(html`
    <div class="lanes-empty" data-lanes-empty>
      <p class="lanes-empty-message">
        No lanes configured. A project needs at least one lane to
        track entries.
      </p>
      <a
        class="lanes-btn lanes-btn--primary"
        href="#lanes-new-form-heading"
        data-lanes-cta-focus
      >
        Create your first lane
      </a>
    </div>`);
}
