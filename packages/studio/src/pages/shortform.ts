/**
 * Shortform review page — `/dev/editorial-review-shortform`.
 *
 * Cross-site list of every open shortform workflow, grouped by platform.
 * Each card carries the workflow's `(site, slug, platform, channel)`
 * identity plus the markdown for the current version, and a save /
 * approve / iterate / reject control strip. The interactivity ships
 * inline (audiocontrol kept it inline) — the bundled studio client
 * also provides toast + polling, but the per-card wiring stays here
 * so a card-only re-render doesn't need a fresh module load.
 *
 * Ported from `editorial-review-shortform.astro`. The site label that
 * was hardcoded `'AC' | 'EC'` is now the first 2 letters of the
 * configured site name uppercased.
 */

import { listOpen, readVersions } from '@deskwork/core/review/pipeline';
import type {
  DraftVersion,
  DraftWorkflowItem,
} from '@deskwork/core/review/types';
import type { StudioContext } from '../routes/api.ts';
import { html, unsafe, type RawHtml } from './html.ts';
import { layout } from './layout.ts';
import { renderEditorialFolio } from './chrome.ts';

const PLATFORM_ORDER = ['reddit', 'linkedin', 'youtube', 'instagram'] as const;

interface Card {
  workflow: DraftWorkflowItem;
  currentVersion: DraftVersion | null;
}

function siteLabel(site: string): string {
  return site.slice(0, 2).toUpperCase();
}

function loadCards(ctx: StudioContext): Card[] {
  const open: DraftWorkflowItem[] = [];
  for (const w of listOpen(ctx.projectRoot, ctx.config)) {
    if (w.contentKind === 'shortform') open.push(w);
  }
  const cards: Card[] = open.map((w) => {
    const versions = readVersions(ctx.projectRoot, ctx.config, w.id);
    const currentVersion =
      versions.find((v) => v.version === w.currentVersion) ?? null;
    return { workflow: w, currentVersion };
  });
  cards.sort((a, b) =>
    b.workflow.updatedAt.localeCompare(a.workflow.updatedAt),
  );
  return cards;
}

function groupByPlatform(cards: Card[]): {
  byPlatform: Map<string, Card[]>;
  ordered: string[];
} {
  const byPlatform = new Map<string, Card[]>();
  for (const card of cards) {
    const key = card.workflow.platform ?? 'other';
    const list = byPlatform.get(key) ?? [];
    list.push(card);
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

function renderCard(card: Card): RawHtml {
  const { workflow: w, currentVersion } = card;
  const channelMarkup = w.channel
    ? unsafe(html`<span class="channel">${w.channel}</span>`)
    : '';
  return unsafe(html`
    <article id="workflow-${w.id}" class="er-galley"
      data-platform="${w.platform ?? 'other'}"
      data-workflow-id="${w.id}"
      data-before-version="${w.currentVersion}"
      data-state="${w.state}"
      data-site="${w.site}">
      <span class="er-galley-accent"></span>
      <header class="er-galley-head">
        <span class="er-row-site er-row-site--${w.site}" title="${w.site}">${siteLabel(w.site)}</span>
        <h3>${w.slug}</h3>
        ${channelMarkup}
        <span class="er-stamp er-stamp-${w.state}">${w.state.replace('-', ' ')}</span>
        <span class="version">v${w.currentVersion}</span>
      </header>
      <textarea data-text>${currentVersion?.markdown ?? ''}</textarea>
      <div class="er-galley-actions">
        <button type="button" class="er-btn er-btn-primary" data-action="save">Save as new version</button>
        <button type="button" class="er-btn er-btn-approve" data-action="approve">Approve</button>
        <button type="button" class="er-btn" data-action="iterate">Iterate</button>
        <button type="button" class="er-btn er-btn-reject" data-action="reject">Reject</button>
        <span style="font-family: var(--er-font-mono); font-size: 0.7rem; color: var(--er-faded); margin-left: auto;" data-hint></span>
      </div>
    </article>`);
}

function renderPlatformSection(
  platform: string,
  cards: Card[],
): RawHtml {
  return unsafe(html`
    <section class="er-platform-section">
      <div class="er-platform-header">
        <h2>${platform}</h2>
        <span class="er-platform-count">№ ${String(cards.length).padStart(2, '0')}</span>
      </div>
      ${cards.map(renderCard)}
    </section>`);
}

export function renderShortformPage(
  ctx: StudioContext,
  focus: string | null = null,
): string {
  const cards = loadCards(ctx);
  const { byPlatform, ordered } = groupByPlatform(cards);

  const cardsBlock = cards.length === 0
    ? html`<div class="er-empty" style="margin-top: var(--er-space-5);">
        No short-form galleys on the desk.<br />
        Start one with <code>/editorial-shortform-draft --site &lt;site&gt; &lt;slug&gt; &lt;platform&gt;</code>
      </div>`
    : ordered
        .map((p) => renderPlatformSection(p, byPlatform.get(p) ?? []).__raw)
        .join('');

  const body = html`
    ${renderEditorialFolio('reviews', 'shortform desk')}
    <header class="er-pagehead er-pagehead--centered">
      <p class="er-pagehead__kicker">All sites · short form</p>
      <h1 class="er-pagehead__title">The <em>compositor</em>'s desk</h1>
      <p class="er-pagehead__deck">Social copy, one galley slip per platform.</p>
      <p class="er-pagehead__meta">
        <span>${cards.length} in flight</span>
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
    <div class="er-toast" id="toast" hidden></div>
    <div class="er-poll-indicator" data-poll>auto-refresh · 10s</div>`;

  return layout({
    title: 'Short form — all sites — dev',
    cssHrefs: [
      '/static/css/editorial-review.css',
      '/static/css/editorial-nav.css',
      '/static/css/editorial-studio.css',
    ],
    bodyAttrs: 'data-review-ui="shortform"',
    bodyHtml: body,
    embeddedJson: focus
      ? [{ id: '', attr: 'data-shortform-focus', data: focus }]
      : [],
    scriptModules: ['/static/dist/editorial-studio-client.js'],
  });
}
