/**
 * Press-queue sidebar — the dashboard's right column.
 *
 * "Press-check" gravity: at the press, the operator wants to know what
 * needs their eyes RIGHT NOW, separately from the at-a-glance pipeline
 * view on the left. This panel surfaces every entry in active review
 * (`reviewState === 'in-review'`), longest-waiting first, with a soft
 * empty state when the press is quiet.
 *
 * Closes the long-empty right column the dashboard's `.er-layout` grid
 * has been declaring since the surface shipped (#158 child concern).
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { Entry, Stage } from '@deskwork/core/schema/entry';
import { formatRelativeTime } from '@deskwork/core/scrapbook';

const STAGE_ORNAMENTS: Record<Stage, string> = {
  Ideas: '◇',
  Planned: '§',
  Outlining: '⊹',
  Drafting: '✎',
  Final: '※',
  Published: '✓',
  Blocked: '⊘',
  Cancelled: '✗',
};

interface AwaitingItem {
  readonly entry: Entry;
  readonly waitedMs: number;
}

/**
 * Filter the dashboard's entries to those currently in review and
 * sort longest-waiting first. The "longest waiting" axis is `updatedAt`
 * — every iterate / review-state-change writes to it, so the entry
 * whose updatedAt is oldest is the one the operator has been ignoring
 * longest.
 */
function selectAwaitingItems(entries: readonly Entry[], now: Date): AwaitingItem[] {
  const items: AwaitingItem[] = [];
  for (const entry of entries) {
    if (entry.reviewState !== 'in-review') continue;
    const updatedAt = new Date(entry.updatedAt).getTime();
    items.push({ entry, waitedMs: now.getTime() - updatedAt });
  }
  items.sort((a, b) => b.waitedMs - a.waitedMs);
  return items;
}

function renderItem(
  item: AwaitingItem,
  defaultSite: string,
  now: Date,
): RawHtml {
  const { entry } = item;
  void defaultSite;
  const reviewLink = `/dev/editorial-review/entry/${entry.uuid}`;
  return unsafe(html`
    <li class="er-press-queue__item" data-stage="${entry.currentStage}">
      <a class="er-press-queue__link" href="${reviewLink}">
        <span class="er-press-queue__ornament" aria-hidden="true">${STAGE_ORNAMENTS[entry.currentStage]}</span>
        <span class="er-press-queue__body">
          <span class="er-press-queue__slug">${entry.slug}</span>
          <span class="er-press-queue__meta">
            <span class="er-press-queue__stage">${entry.currentStage}</span>
            <span class="er-press-queue__sep" aria-hidden="true">·</span>
            <span class="er-press-queue__waited">${formatRelativeTime(entry.updatedAt, now)}</span>
          </span>
        </span>
      </a>
    </li>`);
}

function renderEmptyState(): RawHtml {
  return unsafe(html`
    <div class="er-press-queue__empty">
      <span class="er-press-queue__empty-mark" aria-hidden="true">※</span>
      <p class="er-press-queue__empty-line">The press is quiet.</p>
      <p class="er-press-queue__empty-hint">Nothing in review.</p>
    </div>`);
}

export function renderPressQueue(
  entries: readonly Entry[],
  defaultSite: string,
  now: Date,
): RawHtml {
  const items = selectAwaitingItems(entries, now);
  const body =
    items.length === 0
      ? renderEmptyState()
      : unsafe(html`
          <ol class="er-press-queue__list">
            ${unsafe(
              items
                .map((item) => renderItem(item, defaultSite, now).__raw)
                .join('\n'),
            )}
          </ol>`);
  return unsafe(html`
    <aside class="er-press-queue${items.length === 0 ? ' er-press-queue--empty' : ''}"
           aria-label="Awaiting your eyes">
      <header class="er-press-queue__head">
        <p class="er-press-queue__kicker">Press queue</p>
        <h2 class="er-press-queue__title">Awaiting your <em>eyes</em></h2>
        <p class="er-press-queue__count">№ ${items.length}</p>
      </header>
      ${body}
    </aside>`);
}
