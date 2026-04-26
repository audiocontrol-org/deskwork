/**
 * Shortform review page — `/dev/editorial-review-shortform`.
 *
 * Lists open shortform workflows by platform. Each workflow has a
 * (site, slug, platform, channel) identity and a markdown body that
 * gets approved into the calendar's distribution record.
 *
 * NOTE: Phase 3 lands a minimal scaffold. Phase 4 ports the full
 * audiocontrol editorial-review-shortform.astro template (~270 lines)
 * and the inline client JS.
 */

import { listOpen } from '@deskwork/core/review/pipeline';
import type { StudioContext } from '../routes/api.ts';
import { layout } from './layout.ts';

export function renderShortformPage(ctx: StudioContext): string {
  const allShortform = listOpen(ctx.projectRoot, ctx.config).filter(
    (w) => w.contentKind === 'shortform',
  );

  const data = {
    projectRoot: ctx.projectRoot,
    workflows: allShortform,
  };

  const body = `
    <main data-review-ui="shortform">
      <header>
        <p class="muted"><a href="/dev/editorial-studio">← studio</a></p>
        <h1>Shortform Review</h1>
      </header>
      ${allShortform.length === 0 ? '<p class="muted"><em>No shortform workflows in flight.</em></p>' : renderWorkflows(allShortform)}
    </main>
  `;

  return layout({
    title: 'Shortform Review',
    cssHrefs: ['/static/review.css'],
    bodyHtml: body,
    embeddedJson: { id: 'shortform-state', data },
    scriptModules: [],
  });
}

function renderWorkflows(workflows: ReturnType<typeof listOpen>): string {
  return `
    <ul class="workflow-list">
      ${workflows
        .map(
          (w) => `
        <li data-workflow-id="${escapeAttr(w.id)}">
          <strong>${escapeHtml(w.slug)}</strong>
          <span class="muted">${escapeHtml(w.platform ?? '')}${w.channel ? ' · ' + escapeHtml(w.channel) : ''}</span>
          <span class="state state-${escapeAttr(w.state)}">${escapeHtml(w.state)}</span>
        </li>
      `,
        )
        .join('')}
    </ul>
  `;
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
