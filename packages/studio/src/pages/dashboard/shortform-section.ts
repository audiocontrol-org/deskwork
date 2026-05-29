/**
 * Shortform-by-platform section renderer (Step 2.2.9 — studio-mobile-first).
 *
 * Per DESIGN-STANDARDS.md § Desk information architecture, the Desk's
 * second section absorbs the legacy `/dev/editorial-review-shortform`
 * page as four platform tiles (LinkedIn / Reddit / YouTube / Instagram),
 * each collapsible to reveal that platform's open workflows. Tiles share
 * the longform-pipeline tile shape (data-stage-tile + aria-expanded +
 * data-stage-section attrs) so the existing `dashboard/stage-tiles.ts`
 * client controller can drive both. `data-stage-section-group="shortform"`
 * partitions single-expand state so longform and shortform open
 * independently.
 *
 * Per DESKWORK-STATE-MACHINE.md Commandment III, rows do NOT render
 * `.er-stamp` / `er-stamp-<state>` chrome. The pre-v7 shortform page
 * rendered review-state stamps inline; this section does not.
 *
 * Per THESIS Consequence 2, rows are navigation-only. The trailing `⋮`
 * placeholder anchor links to `/dev/editorial-review/<workflow.id>`;
 * Step 2.2.10 lands the v0.20-style row popover with stage-aware verbs
 * once the shortform verb-routing pieces (issues G.1-G.6) land. This
 * commit does NOT smuggle verb-routing in early. Tracked in
 * https://github.com/audiocontrol-org/deskwork/issues/263.
 *
 * TRANSITIONAL SHAPE: this row's `er-row-shell` markup is a strict
 * subset of the longform row shell defined in
 * `dashboard/section.ts:renderRow`. Longform shells carry three
 * children (`er-row-drawer`, `er-row-fg`, `er-row-menu`); this shell
 * carries only the `er-row-fg`. Step 2.2.10's popover wire-up is
 * purely additive on the existing shape — it inserts the missing
 * `er-row-menu` (and possibly `er-row-drawer` if a swipe gesture is
 * scoped in). Keep the two row paths' attribute conventions aligned
 * (data-row-shell, data-platform, data-site, data-slug already match)
 * so the unification stays straightforward.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';
import type { Platform } from '@deskwork/core/types';
import { DASHBOARD_PLATFORM_ORDER } from './data.ts';

/** Per-platform display metadata. Mirrors desk-states-v7.html:632-655. */
interface PlatformChrome {
  /** Two-character badge inside the tile (replaces the longform stage glyph). */
  readonly badge: string;
  /** Display name on the tile. */
  readonly name: string;
  /** CSS variant suffix for `.er-platform-badge--<variant>`. */
  readonly variant: string;
}

const PLATFORM_CHROME: Record<Platform, PlatformChrome> = {
  linkedin: { badge: 'in', name: 'LinkedIn', variant: 'linkedin' },
  reddit: { badge: 'r/', name: 'Reddit', variant: 'reddit' },
  youtube: { badge: '@', name: 'YouTube', variant: 'youtube' },
  instagram: { badge: 'IG', name: 'Instagram', variant: 'instagram' },
};

/**
 * Render the shortform section head — `<div class="er-desk-section-head
 * er-desk-section-head--shortform">` matching the mockup's
 * `.desk-section-head.shortform` shape. Glyph + label + caption count.
 */
export function renderShortformSectionHead(totalCount: number): RawHtml {
  return unsafe(html`
    <div class="er-desk-section-head er-desk-section-head--shortform">
      <span class="er-desk-section-head-glyph" aria-hidden="true">⊟</span>
      <span class="er-desk-section-head-label">Shortform · by platform</span>
      <span class="er-desk-section-head-count">· ${totalCount} ${totalCount === 1 ? 'workflow' : 'workflows'}</span>
    </div>`);
}

/**
 * Render one platform tile. Shares its tile shape + a11y attrs with the
 * longform stage tile so the stage-tiles.ts client controller drives
 * both. Empty platforms get `disabled` + `.is-empty` so the operator
 * sees the platform exists but cannot drill into nothing.
 */
export function renderShortformPlatformTile(
  platform: Platform,
  count: number,
): RawHtml {
  const chrome = PLATFORM_CHROME[platform];
  const isEmpty = count === 0;
  const classes = isEmpty
    ? 'er-stage-tile er-stage-tile--shortform is-empty'
    : 'er-stage-tile er-stage-tile--shortform';
  const disabledAttr = isEmpty ? ' disabled' : '';
  const sectionId = `shortform-${platform}`;
  return unsafe(html`
    <button class="${classes}" type="button"
      data-stage-tile="${sectionId}"
      data-stage-section-group="shortform"
      aria-expanded="false"
      aria-controls="${sectionId}"${unsafe(disabledAttr)}>
      <span class="er-platform-badge er-platform-badge--${chrome.variant}" aria-hidden="true">${chrome.badge}</span>
      <span class="er-stage-tile-name">${chrome.name}</span>
      <span class="er-stage-tile-count"><span class="num">${count}</span></span>
      <span class="er-stage-tile-chev" aria-hidden="true">›</span>
    </button>`);
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

/**
 * Render a single shortform workflow row. Mirrors the v0.20 row-affordance
 * shape: shell + foreground (slug + title + channel) + meta column (ts +
 * version) + trailing `⋮`. The `⋮` is a navigation placeholder anchor —
 * Step 2.2.10 wires the stage-aware row popover.
 */
export function renderShortformRow(
  workflow: DraftWorkflowItem,
  now: Date,
): RawHtml {
  // workflow.id is typed as `string` on DraftWorkflowItem; UUIDs are the
  // current shape but the type system doesn't enforce that. Encode the
  // path segment so a future non-UUID id (e.g. one containing `?`, `#`,
  // space) doesn't silently produce a broken link.
  const reviewLink = `/dev/editorial-review/${encodeURIComponent(workflow.id)}`;
  const search = [workflow.slug, workflow.channel ?? '', workflow.platform ?? '']
    .join(' ')
    .toLowerCase();
  const channelMarkup: RawHtml = workflow.channel
    ? unsafe(html`<span class="er-row-shell-channel">${workflow.channel}</span>`)
    : unsafe('');
  // The workflow `slug` is the post slug; we surface it as the row's
  // primary handle (consistent with longform rows). The workflow `id` is
  // the navigation key (uuid in the review-pipeline store).
  return unsafe(html`
    <div class="er-row-shell er-row-shell--shortform"
      data-row-shell data-search="${search}"
      data-workflow-id="${workflow.id}"
      data-platform="${workflow.platform ?? ''}"
      data-site="${workflow.site}"
      data-slug="${workflow.slug}">
      <div class="er-row-fg er-shortform-row-fg">
        <div class="er-shortform-row-body">
          <span class="er-row-shell-slug"><a href="${reviewLink}"
            title="open the review surface">${workflow.slug}</a></span>
          ${channelMarkup}
        </div>
        <div class="er-shortform-row-meta">
          <span class="er-shortform-row-ts">${fmtRelTime(workflow.updatedAt, now)}</span>
          <span class="er-shortform-row-version">v${workflow.currentVersion}</span>
        </div>
        <a class="er-row-shell-link" href="${reviewLink}"
          aria-label="Open shortform review for ${workflow.slug}"
          title="open the review surface">⋮</a>
      </div>
    </div>`);
}

/**
 * Render the platform's row group — the `<div class="er-row-group">`
 * container holding all rows for that platform. The container carries
 * the `data-stage-section` attr the stage-tiles.ts controller targets
 * to apply `data-collapsed`.
 */
function renderPlatformRowGroup(
  platform: Platform,
  workflows: readonly DraftWorkflowItem[],
  now: Date,
): RawHtml {
  const sectionId = `shortform-${platform}`;
  if (workflows.length === 0) {
    // Empty platform — still emit the row-group container so the
    // controller's `[data-stage-section="<id>"]` selector resolves. The
    // tile is `disabled` so it cannot expand anyway; the empty container
    // is structurally inert.
    return unsafe(html`
      <div class="er-row-group" id="${sectionId}" data-stage-section="${sectionId}"></div>`);
  }
  const rows = workflows.map((w) => renderShortformRow(w, now).__raw).join('');
  return unsafe(html`
    <div class="er-row-group" id="${sectionId}" data-stage-section="${sectionId}">
      ${unsafe(rows)}
    </div>`);
}

/**
 * Section data shape — the renderer reads counts + workflows per platform
 * from the dashboard's loadDashboardData() output. Caller passes the
 * ordered Map directly (insertion order = display order).
 */
export interface ShortformSectionData {
  readonly shortformByPlatform: ReadonlyMap<Platform, readonly DraftWorkflowItem[]>;
  readonly totalCount: number;
}

/**
 * Compose the full shortform section: head + 4 platform tiles + per-
 * platform row groups, in `DASHBOARD_PLATFORM_ORDER` order. All 4
 * platforms render even when zero — empty tiles communicate platform
 * existence (per § Empty-state rendering, "the absence of items is
 * information about the pipeline shape").
 *
 * API shape note: this helper iterates platforms internally (single
 * call → whole section), whereas the longform `renderStageSection` is
 * called per-stage by `dashboard.ts` (caller iterates). The asymmetry
 * is intentional: longform stages share a uniform shape across all
 * eight stages, so the caller-iterates pattern keeps the loop visible
 * in `dashboard.ts`. Shortform's four platforms share a section head
 * and ordered iteration constraint that lives more cleanly inside the
 * composer. If a future surface needs both shapes via a common
 * abstraction, the unification belongs there, not here.
 */
export function renderShortformSection(
  data: ShortformSectionData,
  now: Date,
): RawHtml {
  const sectionHead = renderShortformSectionHead(data.totalCount);
  const tilesAndGroups = DASHBOARD_PLATFORM_ORDER.map((platform) => {
    const workflows = data.shortformByPlatform.get(platform) ?? [];
    const tile = renderShortformPlatformTile(platform, workflows.length);
    const group = renderPlatformRowGroup(platform, workflows, now);
    return `${tile.__raw}${group.__raw}`;
  }).join('');
  return unsafe(html`${sectionHead}${unsafe(tilesAndGroups)}`);
}
