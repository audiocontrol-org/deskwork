/**
 * Multi-lane swimlane dashboard shell — Direction 3 "Press Bay" v11.
 *
 * Phase 5 Task 5.1 renders the bay-shell foundation:
 *   - Left lane-visibility rail (desktop) listing every lane with
 *     glyph + name + eye-toggle (visibility) + drag-stub.
 *   - Bay main column with: focus-chip strip + one `<article
 *     class="swim">` per focused lane + `<button class="swim-stub">`
 *     for visibility-on-but-focus-off lanes.
 *
 * Each swimlane's body renders a kanban-style `.stage-grid` with one
 * `.stage-col` per stage from the lane's template (linearStages then
 * offPipelineStages). The compact per-stage strip (`.swim-compact`)
 * is also emitted; CSS reveals it when the lane is `.collapsed`
 * (state added by Task 5.1A's chevron controller).
 *
 * What's deliberately NOT here (later-task slots only — empty, not
 * stubbed):
 *   - Lane-level collapse / per-stage collapse chevron handlers
 *     (Task 5.1A — markup carries an `<empty-slot>`-style comment
 *     where the chevron will land so 5.1A diff is additive).
 *   - Per-lane kanban ↔ list view toggle (Task 5.1B).
 *   - Per-lane `+ new` Compose chip (Task 5.1C).
 *   - Drag-to-reorder rail handler (Task 5.4).
 *   - Saveable focus presets + deep-link URL (Task 5.5).
 *
 * The markup leaves explicit `<!-- 5.1A slot -->` / `<!-- 5.1B
 * slot -->` / `<!-- 5.1C slot -->` HTML comments so the next
 * dispatch's diff is additive (drop in the affordance; no markup
 * needs removing).
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { renderRow } from './section.ts';
import { stageGlyph, GLYPH_OFF } from './swimlane-stage-glyph.ts';
import { laneGlyph } from './lane-glyph.ts';
import { projectKeyHash } from './project-key.ts';
import { isEditorialStage, renderEntryCard } from './swimlane-entry-card.ts';
import type { LaneBucket, LaneBucketsResult } from './lane-data.ts';
import type { Entry } from '@deskwork/core/schema/entry';

export interface SwimlaneShellInput {
  readonly lanes: LaneBucketsResult;
  readonly defaultSite: string;
  /**
   * Absolute project root path. The shell hashes it into a stable
   * 12-char token and emits it as `data-project-key` on the bay
   * shell so the client controller can namespace its localStorage
   * state per project (preventing cross-project key collisions when
   * two projects share a studio route).
   */
  readonly projectRoot: string;
  /**
   * URL `?focus=<csv>` value parsed from the request. When present,
   * takes precedence over localStorage (handled server-side: lanes
   * not in the focus set render as `.swim-stub`s; lanes in the set
   * render as full `.swim`s). When absent, server-side default is
   * "all visible lanes focused" — the client controller may later
   * override that via localStorage (post-DOMContentLoaded).
   */
  readonly focusFromUrl: readonly string[] | null;
}

interface LaneRailRow {
  readonly id: string;
  readonly name: string;
  readonly entryCount: number;
  readonly inFocus: boolean;
  readonly visible: true;
  /**
   * Template id resolved from the lane's pipeline template. Used to
   * pick the per-lane press-check glyph (`§` / `◆` / `⊹` / `⊕` /
   * `⌘`) in the rail row, focus chip, swim-head, and swim-stub.
   */
  readonly templateId: string;
}

/**
 * Parse a CSV `?focus=` parameter into a deduplicated lane-id list.
 * Empty values are dropped; whitespace trimmed. Returns null when
 * the input string is null OR empty after trimming (callers treat
 * null as "no URL override").
 */
export function parseFocusCsv(raw: string | null): readonly string[] | null {
  if (raw === null) return null;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  // Dedupe while preserving first-seen order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out;
}

/**
 * Decide which lanes are FOCUSED for the current render. Server-side
 * decisions:
 *   - `focusFromUrl !== null`: that list wins (any lane id NOT in the
 *     list renders as a stub; any id in the list AND present on disk
 *     renders as a full swimlane; any id in the list but NOT on disk
 *     is ignored).
 *   - `focusFromUrl === null`: every lane that exists on disk is
 *     focused by default. The client controller post-DOMContentLoaded
 *     may narrow this via localStorage; that's a client concern only.
 */
function computeFocus(
  laneIds: readonly string[],
  focusFromUrl: readonly string[] | null,
): { focused: Set<string>; urlDriven: boolean } {
  if (focusFromUrl === null) {
    return { focused: new Set(laneIds), urlDriven: false };
  }
  const focused = new Set<string>();
  for (const id of focusFromUrl) {
    if (laneIds.includes(id)) focused.add(id);
  }
  return { focused, urlDriven: true };
}

function renderRailRow(row: LaneRailRow): RawHtml {
  const classes = row.inFocus ? 'rail-lane focused' : 'rail-lane';
  // Per AUDIT-20260528-04 sub-issue B: render BOTH eye glyphs as
  // siblings inside `.r-eye`; CSS picks which one shows based on the
  // parent `.rail-lane[data-lane-visible]` attribute. The client
  // controller updates the data attribute on visibility toggles; CSS
  // swaps which glyph is visible. Mirrors the `.sc-glyph-default` /
  // `.sc-glyph-copied` pattern used elsewhere.
  return unsafe(html`
    <div class="${classes}" role="button" tabindex="0"
      data-rail-lane="${row.id}"
      aria-pressed="${row.inFocus ? 'true' : 'false'}"
      data-lane-visible="true">
      <span class="r-eye" aria-hidden="true"
        ><span class="r-eye-visible">●</span><span class="r-eye-hidden">○</span></span>
      <span class="r-glyph" aria-hidden="true">${laneGlyph(row.templateId)}</span>
      <span class="r-name">${row.name}</span>
      <span class="r-count">${row.entryCount}</span>
      <!-- Task 5.4 slot: drag handle for lane reorder. Renders as a
           non-interactive stub for 5.1 so muscle-memory is in place;
           5.4 wires the handler. -->
      <span class="rail-drag" aria-hidden="true">⋮⋮</span>
    </div>`);
}

function renderRail(
  laneRows: readonly LaneRailRow[],
  laneCount: number,
): RawHtml {
  const rowsRaw = laneRows.map((r) => renderRailRow(r).__raw).join('');
  return unsafe(html`
    <aside class="lane-rail" data-lane-rail>
      <div class="rail-head">
        Lanes
        <span class="rail-head-count" aria-hidden="true">${laneCount} visible</span>
      </div>
      ${unsafe(rowsRaw)}
    </aside>`);
}

function renderFocusChip(row: LaneRailRow): RawHtml {
  const classes = row.inFocus ? 'focus-chip active' : 'focus-chip';
  return unsafe(html`
    <button class="${classes}" type="button" data-focus-chip="${row.id}"
      aria-pressed="${row.inFocus ? 'true' : 'false'}">
      <span class="fc-glyph" aria-hidden="true">${laneGlyph(row.templateId)}</span>
      <span class="fc-label">${row.name}</span>
      <span class="fc-count">${row.entryCount}</span>
    </button>`);
}

function renderFocusStrip(
  laneRows: readonly LaneRailRow[],
  allActive: boolean,
): RawHtml {
  const chipsRaw = laneRows.map((r) => renderFocusChip(r).__raw).join('');
  const allClass = allActive ? 'focus-chip all active' : 'focus-chip all';
  return unsafe(html`
    <nav class="focus-strip" aria-label="Lane focus filter" data-focus-strip>
      <span class="strip-label">Focus</span>
      <button class="${allClass}" type="button" data-focus-chip-all
        aria-pressed="${allActive ? 'true' : 'false'}">
        <span class="fc-label">All</span>
        <span class="fc-count">${laneRows.length}</span>
      </button>
      <div class="strip-divider" aria-hidden="true"></div>
      ${unsafe(chipsRaw)}
    </nav>`);
}

/**
 * Per-stage column renderer. Each column carries:
 *
 *   - `data-stage-col="<stage>"` — the swimlane-shell's own data
 *     attribute, scoped to the new bay-shell affordances.
 *   - `data-stage-section="<stage>"` — back-compat attribute the
 *     pre-Task-5.1 dashboard emitted on its `<section>` wrappers. The
 *     legacy filter strip + stage-tile + ordering tests still target
 *     it; preserving the attribute here means none of those tests
 *     need to change as the bay-shell ships.
 *   - `id="lane-<laneId>-stage-<stageSlug>"` — DOM-unique ID per
 *     lane. Per AUDIT-20260528-05: lanes share stage names (e.g.
 *     `Approved` appears in both `visual` and `qa-plan` templates),
 *     so the previous `id="stage-<slug>"` collided across multiple
 *     lanes on a multi-lane page. The default editorial lane ALSO
 *     emits the bare `id="stage-<slug>"` anchor (back-compat for the
 *     shortform-empty-state deep-link href
 *     `/dev/editorial-studio#stage-drafting` — see `pages/
 *     shortform.ts:113` and `pages/index.ts:114`). Other lanes do
 *     not emit the bare anchor; their stage columns are reachable
 *     only via the lane-scoped ID.
 *   - `data-empty-stage="<stage>"` on empty columns — back-compat
 *     hook for the legacy empty-state assertion shape.
 *
 * Empty-state body carries the same placeholder copy the legacy
 * renderer emitted so the operator's read of "what to run next"
 * lands identically.
 */
function renderStageCol(
  laneId: string,
  stage: string,
  entries: readonly Entry[],
  defaultSite: string,
  glyph: string,
  isOffPipeline: boolean,
  isLocked: boolean,
): RawHtml {
  // Empty columns also pick up `er-section--empty` for back-compat
  // with the legacy compact-empty assertion (#112). The class lives
  // on the column root so existing CSS-level expectations carry
  // forward.
  const emptyClass = entries.length === 0 ? ' empty er-section--empty' : '';
  const offClass = isOffPipeline ? ' off-pipeline' : '';
  // Per the mockup at line 420 (.lb-group.locked .lb-glyph) and
  // lines 540 / 826 (.swim-compact .sc-stage.locked .sc-count), a
  // template's lockedStages render with proof-blue accent so the
  // operator's eye picks them up. The kanban analogue is the
  // `.stage-col.locked` modifier emitted here; dashboard-swimlane.
  // css applies the colour to the stage-glyph + stage-name.
  const lockedClass = isLocked ? ' locked' : '';
  const stageIdSlug = stage.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const laneIdSlug = laneId.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  // Lane-scoped DOM ID is the canonical anchor — unique per multi-
  // lane page (AUDIT-20260528-05). The default editorial lane also
  // mounts a legacy `<span id="stage-<slug>">` inside the column so
  // existing deep links (`/dev/editorial-studio#stage-drafting` from
  // `pages/shortform.ts` + `pages/index.ts`) continue to resolve.
  const stageId = `lane-${laneIdSlug}-stage-${stageIdSlug}`;
  const legacyAnchor = laneId === 'default'
    ? unsafe(`<span id="stage-${stageIdSlug}" aria-hidden="true"></span>`)
    : '';
  const emptyHint = stageEmptyHint(stage);
  const emptyAttrs = entries.length === 0
    ? unsafe(html` data-empty-stage="${stage}"`)
    : '';

  // Stage-vocabulary-driven dispatch: editorial-pipeline stages get
  // the full dashboard row chrome (renderRow → verbsForStage chain).
  // Non-editorial stages render as compact cards so the operator
  // still sees the entry on the page. Task 5.2 generalises
  // verbsForStage by template and removes this dispatch.
  const body = entries.length === 0
    ? unsafe(html`<div class="empty-state" data-empty-stage-msg>${emptyHint}</div>`)
    : unsafe(
      entries
        .map((e, i) => {
          if (isEditorialStage(e.currentStage)) {
            return renderRow(e, i, defaultSite).__raw;
          }
          return renderEntryCard(e, defaultSite).__raw;
        })
        .join(''),
    );

  return unsafe(html`
    <section class="stage-col${unsafe(emptyClass)}${unsafe(offClass)}${unsafe(lockedClass)}"
      id="${stageId}"
      data-stage-col="${stage}"
      data-stage-section="${stage}"${emptyAttrs}>
      ${legacyAnchor}
      <div class="stage-head">
        <span class="stage-glyph" aria-hidden="true">${glyph}</span>
        <span class="stage-name">${stage}</span>
        <span class="stage-count">${entries.length}</span>
        <!-- 5.1A slot: per-stage collapse chevron lands here. -->
      </div>
      ${body}
    </section>`);
}

/**
 * Empty-state placeholder copy. The editorial stages get the
 * pre-Task-5.1 strings verbatim (the dashboard.test.ts assertions
 * pin specific phrasings); other stages get a neutral message.
 */
const STAGE_EMPTY_HINTS: Record<string, string> = {
  Ideas: 'No open ideas. Run /deskwork:add to capture one.',
  Planned: 'Nothing planned. /deskwork:approve <slug> to graduate an idea.',
  Outlining: 'Nothing in outlining.',
  Drafting: 'No posts in drafting.',
  Final: 'Nothing in final review.',
  Published: 'No published posts yet.',
  Blocked: 'Nothing blocked.',
  Cancelled: 'No cancelled entries.',
};

function stageEmptyHint(stage: string): string {
  return STAGE_EMPTY_HINTS[stage] ?? `Nothing in ${stage.toLowerCase()}.`;
}

function renderSwimCompact(bucket: LaneBucket): RawHtml {
  const stages: string[] = [
    ...bucket.template.linearStages,
    ...bucket.template.offPipelineStages,
  ];
  // `lockedStages` is optional on a pipeline template (schema:
  // `uniqueStringArray('lockedStages', 0).optional()`). Treat
  // missing as "no stages locked" — an empty lookup set, never
  // an "every stage locked" sentinel.
  const lockedSet = new Set<string>(bucket.template.lockedStages ?? []);
  const cellsRaw = stages
    .map((stage) => {
      const count = (bucket.byStage.get(stage) ?? []).length;
      const empty = count === 0 ? ' empty' : '';
      const locked = lockedSet.has(stage) ? ' locked' : '';
      return html`
        <div class="sc-stage${unsafe(empty)}${unsafe(locked)}" data-sc-stage="${stage}">
          <span class="sc-name">${stage}</span>
          <span class="sc-count">${count}</span>
        </div>`;
    })
    .join('');
  return unsafe(html`
    <div class="swim-compact" data-swim-compact>${unsafe(cellsRaw)}</div>`);
}

function renderSwimlane(
  bucket: LaneBucket,
  defaultSite: string,
  focusHidden: boolean,
): RawHtml {
  const { lane, template } = bucket;
  const lockedSet = new Set<string>(template.lockedStages ?? []);
  const stagesRaw = [
    ...template.linearStages.map((stage) =>
      renderStageCol(
        lane.id,
        stage,
        bucket.byStage.get(stage) ?? [],
        defaultSite,
        stageGlyph(stage),
        false,
        lockedSet.has(stage),
      ).__raw,
    ),
    ...template.offPipelineStages.map((stage) =>
      renderStageCol(
        lane.id,
        stage,
        bucket.byStage.get(stage) ?? [],
        defaultSite,
        stageGlyph(stage, GLYPH_OFF),
        true,
        // Off-pipeline stages are not part of lockedStages (the
        // template schema enforces lockedStages ⊆ linearStages),
        // so this is always false. Pass it explicitly to keep the
        // signature parallel.
        false,
      ).__raw,
    ),
  ].join('');

  const stageCount = template.linearStages.length + template.offPipelineStages.length;
  const tag = `${template.id} · ${stageCount} stages`;
  const meta = `${bucket.entryCount} entries`;

  // Per AUDIT-20260528-02: the swimlane is server-rendered alongside
  // its stub for every visibility-on lane. CSS hides exactly one
  // based on `.is-focus-hidden`. The class is applied at the server
  // when the lane is not in the initial focus set, and the client
  // controller mirrors the toggle on chip clicks (already wired in
  // `swimlane.ts:153`).
  const focusClass = focusHidden ? ' is-focus-hidden' : '';
  return unsafe(html`
    <article class="swim swim--${template.id}${unsafe(focusClass)}" data-lane-id="${lane.id}"
      data-template-id="${template.id}">
      <div class="swim-head">
        <span class="glyph" aria-hidden="true">${laneGlyph(template.id)}</span>
        <span class="name">${lane.name}</span>
        <span class="tag">${tag}</span>
        <span class="quick-meta">${meta}</span>
        <!-- 5.1B slot: view-toggle (kanban ↔ list) lands here. -->
        <!-- 5.1C slot: + new compose chip lands here. -->
        <!-- 5.1A slot: lane-level collapse chevron lands here. -->
      </div>
      ${renderSwimCompact(bucket)}
      <div class="stage-grid" data-stage-grid>${unsafe(stagesRaw)}</div>
    </article>`);
}

function renderSwimStub(row: LaneRailRow, focusHidden: boolean): RawHtml {
  // Per AUDIT-20260528-02: stub is rendered alongside its swimlane
  // for every visibility-on lane; CSS hides one or the other based
  // on `.is-focus-hidden`. The stub is hidden when the lane IS
  // focused (full swimlane shown) and visible when the lane is
  // focus-off.
  const focusClass = focusHidden ? ' is-focus-hidden' : '';
  return unsafe(html`
    <button class="swim-stub${unsafe(focusClass)}" type="button" data-swim-stub="${row.id}"
      aria-label="Restore ${row.name} to focus">
      <span class="ss-glyph" aria-hidden="true">${laneGlyph(row.templateId)}</span>
      <span class="ss-name">${row.name}</span>
      <span class="ss-meta">hidden by focus · ${row.entryCount} entries · click to restore</span>
      <span class="ss-action" aria-hidden="true">+</span>
    </button>`);
}

/**
 * Build the per-lane rail-row metadata. Note: for Task 5.1 all lanes
 * resolved by `loadLaneBuckets` are treated as `visible: true` —
 * persistent visibility-off is a client-side localStorage concern
 * Task 5.4 introduces (`.deskwork/lane-order.json` for project-wide
 * scope). The server still renders every lane; the client controller
 * adds the `is-hidden` class to lanes the operator has flipped off.
 */
function buildLaneRows(
  byLane: ReadonlyMap<string, LaneBucket>,
  focused: ReadonlySet<string>,
): readonly LaneRailRow[] {
  const out: LaneRailRow[] = [];
  for (const [id, bucket] of byLane) {
    out.push({
      id,
      name: bucket.lane.name,
      entryCount: bucket.entryCount,
      inFocus: focused.has(id),
      visible: true,
      templateId: bucket.template.id,
    });
  }
  return out;
}

/**
 * Top-level renderer: emit the bay shell. Caller (dashboard.ts) wraps
 * this in `<main class="er-container">` siblings (header, shortform,
 * adjacent).
 *
 * Returns an empty string when there are no lanes at all — by the time
 * this is called, `bootstrapDefaultLaneIfMissing` has fired inside
 * `loadLaneBuckets`, so a healthy project always has at least the
 * `default` lane. The empty-string branch exists for the truly
 * pathological case (no legacy config, no operator-created lanes) so
 * the dashboard renders a sane empty state instead of crashing.
 */
export function renderSwimlanesShell(input: SwimlaneShellInput): RawHtml {
  const { lanes, defaultSite, focusFromUrl, projectRoot } = input;
  const projectKey = projectKeyHash(projectRoot);
  const laneIds = Array.from(lanes.byLane.keys());
  if (laneIds.length === 0) {
    return unsafe(html`
      <section class="bay-shell bay-shell--empty" data-bay-shell-empty>
        <p class="bay-empty-message">
          No lanes configured. The default lane bootstrap requires a
          <code>.deskwork/config.json</code> with a
          <code>sites.&lt;defaultSite&gt;</code> block, or an operator-
          authored lane under <code>.deskwork/lanes/</code>.
        </p>
      </section>`);
  }

  const { focused, urlDriven } = computeFocus(laneIds, focusFromUrl);
  const laneRows = buildLaneRows(lanes.byLane, focused);
  const allActive = focused.size === laneIds.length;

  const railRaw = renderRail(laneRows, laneIds.length).__raw;
  const focusStripRaw = renderFocusStrip(laneRows, allActive).__raw;

  // Per AUDIT-20260528-02: render BOTH the swimlane and the stub for
  // every visibility-on lane so the client's focus toggle has both
  // DOM nodes to swap between. The CSS rule
  // `.swim.is-focus-hidden { display: none }` (and its newly-added
  // `.swim-stub.is-focus-hidden` sibling) decides which one shows.
  const bodyRaw = laneRows
    .map((row) => {
      const bucket = lanes.byLane.get(row.id);
      if (bucket === undefined) return '';
      const swimHidden = !row.inFocus;
      const stubHidden = row.inFocus;
      return (
        renderSwimlane(bucket, defaultSite, swimHidden).__raw
        + renderSwimStub(row, stubHidden).__raw
      );
    })
    .join('');

  // Per the mockup at line 1031, when the focus filter narrows the
  // visible set below the total, the bay-head meta prefixes a
  // `<span class="filter-active">Filtered · </span>` badge. The
  // badge is the operator-perceivable signal that some lanes are
  // suppressed; without it, "2 of 3 lanes shown" reads as a static
  // count rather than as a transient filter state.
  const isFiltered = focused.size < laneIds.length;
  const filteredBadge = isFiltered
    ? '<span class="filter-active">Filtered · </span>'
    : '';
  const unroutedPart =
    input.lanes.unroutedEntries.length === 0
      ? ''
      : `${input.lanes.unroutedEntries.length} unrouted · `;
  const metaRaw = `${filteredBadge}${focused.size} of ${laneIds.length} lanes shown · ${unroutedPart}${countTotal(lanes)} entries`;

  return unsafe(html`
    <section class="bay-shell" data-bay-shell
      data-project-key="${projectKey}"
      data-focus-url-driven="${urlDriven ? 'true' : 'false'}">
      ${unsafe(railRaw)}
      <main class="bay" data-bay>
        <div class="bay-head">
          <div class="bh-row-1">
            <span>The Press Bay</span>
            <span class="bh-meta">${unsafe(metaRaw)}</span>
          </div>
          ${unsafe(focusStripRaw)}
        </div>
        ${unsafe(bodyRaw)}
      </main>
    </section>`);
}

function countTotal(lanes: LaneBucketsResult): number {
  let total = 0;
  for (const bucket of lanes.byLane.values()) total += bucket.entryCount;
  return total;
}
