/**
 * Dashboard masthead + filter strip.
 *
 * Pipeline-redesign Task 34. The masthead reads from sidecar-derived
 * counts (total entries, in-review entries) instead of the legacy
 * workflow store. The filter strip exposes one chip per stage so
 * operators can collapse to a single section quickly.
 */

import type { DashboardData } from './data.ts';
import { DASHBOARD_STAGE_ORDER } from './data.ts';
import { html, unsafe, type RawHtml } from '../html.ts';
import { getStudioVersion } from '../../lib/version.ts';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function reviewActiveCount(data: DashboardData): number {
  let n = 0;
  for (const entry of data.entries) {
    if (entry.reviewState === 'in-review' || entry.reviewState === 'iterating') n++;
  }
  return n;
}

function approvedCount(data: DashboardData): number {
  let n = 0;
  for (const entry of data.entries) {
    if (entry.reviewState === 'approved') n++;
  }
  return n;
}

export function renderHeader(
  data: DashboardData,
  projectRoot: string,
  now: Date,
): RawHtml {
  const volume = '01';
  const issueNum = String(data.entries.length).padStart(2, '0');
  const issueDate = `${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  return unsafe(html`
  <header class="er-pagehead er-pagehead--centered">
    <p class="er-pagehead__kicker">
      Vol. ${volume} &middot; № ${issueNum}
    </p>
    <h1 class="er-pagehead__title">
      <em>Press-</em>Check
    </h1>
    <p class="er-pagehead__deck">
      Project: <code>${projectRoot}</code>
      &nbsp;·&nbsp; <a class="er-link-marginalia" href="/dev/editorial-help">the manual</a>
      &nbsp;·&nbsp; <span class="er-pagehead__version" data-studio-version
        title="@deskwork/studio version">v${getStudioVersion()}</span>
    </p>
    <p class="er-pagehead__meta">
      <span>${issueDate}</span>
      <span class="sep">·</span>
      <span>${data.entries.length} on the calendar</span>
      <span class="sep">·</span>
      <span>${reviewActiveCount(data)} in review</span>
      <span class="sep">·</span>
      <span>${approvedCount(data)} approved</span>
    </p>
  </header>`);
}

export function renderFilterStrip(): RawHtml {
  return unsafe(html`
    <section class="er-filter" data-filter-strip>
      <span class="er-filter-label">Find</span>
      <input type="search" data-filter-input placeholder="slug, title…" autocomplete="off" />
      <span class="er-filter-label er-filter-label--gap">Stage</span>
      <div class="er-chips" role="tablist">
        <button class="er-chip" aria-pressed="true" data-stage-chip="all">all</button>
        ${DASHBOARD_STAGE_ORDER.map(
          (s) => unsafe(html`<button class="er-chip" data-stage-chip="${s}">${s.toLowerCase()}</button>`),
        )}
      </div>
    </section>`);
}
