/**
 * Shortform desk index — `/dev/editorial-review-shortform`.
 *
 * Phase 21c: this page used to render compose textareas + dead Save /
 * Approve / Iterate / Reject buttons that had no handlers. The new
 * design unifies shortform + longform behind one review surface, so
 * the desk becomes a pure navigation index — every open shortform
 * workflow is a link into `/dev/editorial-review/<workflow.id>` where
 * the operator gets the full editor (save / iterate / approve /
 * reject) without a parallel composer to maintain.
 *
 * The folio strip + page chrome stay; the per-card textarea +
 * inline action buttons go away.
 */

import { listOpen } from '@deskwork/core/review/pipeline';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

const PLATFORM_ORDER = ['reddit', 'linkedin', 'youtube', 'instagram'] as const;

function siteLabel(site: string): string {
  return site.slice(0, 2).toUpperCase();
}

function loadOpenShortform(ctx: StudioContext): DraftWorkflowItem[] {
  const open: DraftWorkflowItem[] = [];
  for (const w of listOpen(ctx.projectRoot, ctx.config)) {
    if (w.contentKind === 'shortform') open.push(w);
  }
  open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return open;
}

function groupByPlatform(workflows: readonly DraftWorkflowItem[]): {
  byPlatform: Map<string, DraftWorkflowItem[]>;
  ordered: string[];
} {
  const byPlatform = new Map<string, DraftWorkflowItem[]>();
  for (const w of workflows) {
    const key = w.platform ?? 'other';
    const list = byPlatform.get(key) ?? [];
    list.push(w);
    byPlatform.set(key, list);
  }
  const ordered = [
    ...PLATFORM_ORDER.filter((p) => byPlatform.has(p)),
    ...[...byPlatform.keys()].filter(
      (p) => !(PLATFORM_ORDER as readonly string[]).includes(p),
    ),
  ];
  return { byPlatform, ordered };
}

function fmtRelTime(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function renderRow(w: DraftWorkflowItem, now: Date): RawHtml {
  const channelMarkup: RawHtml = w.channel
    ? unsafe(html`<span class="channel">${w.channel}</span>`)
    : unsafe('');
  const reviewUrl = `/dev/editorial-review/${w.id}`;
  return unsafe(html`
    <a class="er-row er-shortform-row"
      href="${reviewUrl}"
      data-workflow-id="${w.id}"
      data-platform="${w.platform ?? 'other'}"
      data-state="${w.state}"
      data-site="${w.site}">
      <span class="er-row-num">→</span>
      <span class="er-row-site er-row-site--${w.site}" title="${w.site}">${siteLabel(w.site)}</span>
      <span class="er-row-slug">${w.slug}</span>
      ${channelMarkup}
      <span class="er-stamp er-stamp-${w.state}">${w.state.replace('-', ' ')}</span>
      <span class="er-row-ts">v${w.currentVersion} · ${fmtRelTime(w.updatedAt, now)}</span>
      <span class="er-row-hint">Open in review →</span>
    </a>`);
}

function renderPlatformSection(
  platform: string,
  workflows: readonly DraftWorkflowItem[],
  now: Date,
): RawHtml {
  const rows = workflows.map((w) => renderRow(w, now).__raw).join('');
  return unsafe(html`
    <section class="er-platform-section">
      <div class="er-platform-header">
        <h2>${platform}</h2>
        <span class="er-platform-count">№ ${String(workflows.length).padStart(2, '0')}</span>
      </div>
      ${unsafe(rows)}
    </section>`);
}

function renderEmptyState(): RawHtml {
  const platformList = PLATFORM_ORDER.join(', ');
  return unsafe(html`
    <div class="er-empty" style="margin-top: var(--er-space-5);">
      No short-form galleys on the desk.<br />
      Supported platforms: <em>${platformList}</em>.<br />
      Start a new shortform draft from the dashboard's
      <a href="/dev/editorial-studio">coverage matrix</a>.
    </div>`);
}

export function renderShortformPage(ctx: StudioContext): string {
  const workflows = loadOpenShortform(ctx);
  const { byPlatform, ordered } = groupByPlatform(workflows);
  const now = ctx.now ? ctx.now() : new Date();

  const cardsBlock =
    workflows.length === 0
      ? renderEmptyState().__raw
      : ordered
          .map((p) => renderPlatformSection(p, byPlatform.get(p) ?? [], now).__raw)
          .join('');

  const body = html`
    ${renderEditorialFolio('reviews', 'shortform desk')}
    <header class="er-pagehead er-pagehead--centered">
      <p class="er-pagehead__kicker">All sites · short form</p>
      <h1 class="er-pagehead__title">The <em>compositor</em>'s desk</h1>
      <p class="er-pagehead__deck">Open shortform galleys — click any row to open the unified review surface.</p>
      <p class="er-pagehead__meta">
        <span>${workflows.length} in flight</span>
        <span class="sep">·</span>
        <span>${ordered.length} ${ordered.length === 1 ? 'platform' : 'platforms'}</span>
      </p>
    </header>
    <main class="er-container" style="padding-top: var(--er-space-4); padding-bottom: var(--er-space-6);">
      ${unsafe(cardsBlock)}
      <p style="margin-top: var(--er-space-5); font-family: var(--er-font-display); font-style: italic; color: var(--er-faded);">
        <a href="/dev/editorial-studio">← back to the studio</a>
      </p>
    </main>
    <div class="er-toast" id="toast" hidden></div>`;

  return layout({
    title: 'Short form — all sites — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-studio.css',
    ],
    bodyAttrs: 'data-review-ui="shortform"',
    bodyHtml: body,
    embeddedJson: [],
    scriptModules: ['/static/dist/editorial-studio-client.js'],
  });
}
