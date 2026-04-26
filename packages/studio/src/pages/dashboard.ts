/**
 * Studio dashboard page — `/dev/editorial-studio`.
 *
 * Reads the calendar(s) and open workflows from disk, then renders an HTML
 * page that embeds the data as JSON for the client JS to hydrate.
 *
 * NOTE: Phase 3 lands a minimal scaffold. Phase 4 ports the full
 * audiocontrol editorial-studio.astro template (~615 lines of HTML/JSX +
 * the matching ~643 lines of client JS) into this render function and
 * the public/ assets.
 */

import { readCalendar } from '@deskwork/core/calendar';
import { listOpen } from '@deskwork/core/review/pipeline';
import { resolveCalendarPath } from '@deskwork/core/paths';
import type { StudioContext } from '../routes/api.ts';
import { layout } from './layout.ts';

export function renderDashboard(ctx: StudioContext): string {
  const sites = Object.keys(ctx.config.sites);
  const sitesData = sites.map((site) => {
    const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
    const calendar = safeReadCalendar(calendarPath);
    const openWorkflows = listOpen(ctx.projectRoot, ctx.config, site);
    return { site, calendarPath, calendar, openWorkflows };
  });

  const data = {
    projectRoot: ctx.projectRoot,
    defaultSite: ctx.config.defaultSite,
    sites: sitesData,
  };

  const body = `
    <main data-review-ui="studio">
      <h1>Editorial Studio</h1>
      <p class="muted">Project: <code>${escapeHtml(ctx.projectRoot)}</code></p>
      ${sitesData.map(renderSiteSection).join('\n')}
    </main>
  `;

  return layout({
    title: 'Editorial Studio',
    cssHrefs: ['/static/studio.css', '/static/review.css'],
    bodyHtml: body,
    embeddedJson: { id: 'studio-state', data },
    scriptModules: ['/static/studio-client.js'],
  });
}

function renderSiteSection(s: { site: string; openWorkflows: ReturnType<typeof listOpen>; calendar: ReturnType<typeof safeReadCalendar> }): string {
  const open = s.openWorkflows;
  return `
    <section class="site" data-site="${escapeAttr(s.site)}">
      <h2>${escapeHtml(s.site)}</h2>
      <p class="muted">${s.calendar.entries.length} calendar entries · ${open.length} open workflows</p>
      ${open.length > 0 ? renderWorkflowList(open) : '<p class="muted"><em>No workflows in flight.</em></p>'}
    </section>
  `;
}

function renderWorkflowList(workflows: ReturnType<typeof listOpen>): string {
  return `
    <ul class="workflow-list">
      ${workflows
        .map(
          (w) => `
        <li>
          <a href="/dev/editorial-review/${escapeAttr(w.slug)}?site=${escapeAttr(w.site)}">${escapeHtml(w.slug)}</a>
          <span class="state state-${escapeAttr(w.state)}">${escapeHtml(w.state)}</span>
          <span class="muted">v${w.currentVersion} · ${escapeHtml(w.contentKind)}</span>
        </li>
      `,
        )
        .join('')}
    </ul>
  `;
}

function safeReadCalendar(path: string) {
  try {
    return readCalendar(path);
  } catch {
    return { entries: [], distributions: [] };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
