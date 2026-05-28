/**
 * Per-lane swimlane card renderer for the multi-lane dashboard
 * (Phase 5 Task 5.1 + Task 5.1A — per-lane collapse + Task 5.1B —
 * per-lane kanban ↔ list view toggle).
 *
 * Renders:
 *   - `renderSwimlane`: the full `<article class="swim">` for a
 *     focused lane (swim-head + swim-compact strip + kanban-style
 *     stage grid with one column per template stage). The swim-head
 *     now carries a `<button class="collapse-chev">` at the tail —
 *     Task 5.1A's lane-level collapse affordance (aria-expanded +
 *     aria-label per WAI-ARIA Authoring Practices for disclosure
 *     widgets; ≥24×24 hit target per WCAG 2.2 SC 2.5.8 AA;
 *     focus-visible ring per WCAG 2.1 SC 2.4.7 AA). Initial state
 *     is server-rendered as expanded (`aria-expanded="true"`); the
 *     client controller restores the operator's persisted state
 *     from localStorage post-DOMContentLoaded.
 *     Task 5.1B adds a `.view-toggle` segmented control between
 *     `.quick-meta` and the lane-collapse chevron — two `<button
 *     class="vt-cell">` cells (`▦ Kanban` / `≡ List`) with `role=
 *     "radio"` + `aria-checked` per WAI-ARIA Authoring Practices.
 *     Both `.stage-grid` AND `.list-body` are server-rendered for
 *     every swim; CSS shows exactly one via `.swim.view-kanban` /
 *     `.swim.view-list`. The server default is kanban; the client
 *     controller post-DOMContentLoaded applies viewport-default
 *     (mobile→list) + per-lane localStorage override.
 *   - `renderSwimStub`: the compact `<button class="swim-stub">`
 *     emitted alongside the swim for visibility-on lanes. CSS picks
 *     which one shows via `.is-focus-hidden`.
 *   - `renderStageCol`: per-stage kanban column with lane-scoped
 *     DOM ID, back-compat anchors for the default editorial lane,
 *     locked-stage / off-pipeline modifiers, and the dispatch
 *     between the editorial verb-chip row and the lighter
 *     `renderEntryCard` for non-editorial stages. The stage-head now
 *     carries a per-stage `<button class="collapse-chev">` mirroring
 *     the lane-level chevron's contract (same a11y primitives,
 *     `data-collapse-target="stage"` for the client dispatcher).
 *   - `renderSwimCompact`: the compact per-stage strip rendered
 *     inside every swim; CSS reveals it when the lane is
 *     `.collapsed` (state added by Task 5.1A's chevron controller).
 *   - `renderViewToggle`: segmented `▦ Kanban` / `≡ List` control
 *     in the swim-head. Per `affordance-placement.md`, the toggle
 *     lives ON the lane it controls.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { renderRow } from './section.ts';
import { stageGlyph, GLYPH_OFF } from './swimlane-stage-glyph.ts';
import { laneGlyph } from './lane-glyph.ts';
import { renderEntryCard } from './swimlane-entry-card.ts';
import { renderListBody } from './swimlane-list-body.ts';
import { isLegacyEditorialStage } from './legacy-stage.ts';
import type { LaneBucket } from './lane-data.ts';
import type { LaneRailRow } from './swimlane-rail.ts';
import type { Entry } from '@deskwork/core/schema/entry';

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
  // verbsForStage by template and removes this dispatch. The guard
  // here uses the single project-wide editorial-stage guard
  // `isLegacyEditorialStage` (`./legacy-stage.ts`) — no local copy.
  const body = entries.length === 0
    ? unsafe(html`<div class="empty-state" data-empty-stage-msg>${emptyHint}</div>`)
    : unsafe(
      entries
        .map((e, i) => {
          if (isLegacyEditorialStage(e.currentStage)) {
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
        <button class="collapse-chev" type="button"
          aria-expanded="true"
          aria-label="Collapse ${stage} stage"
          data-collapse-target="stage"
          data-lane-id="${laneId}"
          data-stage-name="${stage}">▾</button>
      </div>
      ${body}
    </section>`);
}

/**
 * Per-lane view-toggle (Task 5.1B). Renders the segmented `▦ Kanban`
 * / `≡ List` control in the swim-head. Two real `<button>` cells
 * grouped under `role="radiogroup"` per WAI-ARIA Authoring Practices
 * for radio buttons; each cell carries `role="radio"` + `aria-
 * checked`. The server-default selection is kanban — the client
 * controller post-DOMContentLoaded applies the viewport-aware
 * default (mobile→list) and any per-lane localStorage override.
 *
 * The toggle lives ON the lane it controls (per `affordance-place
 * ment.md` — component-attached affordances over toolbar-attached
 * affordances). When the lane is `.collapsed`, the CSS rule `.swim
 * .collapsed .view-toggle { opacity: 0.4; pointer-events: none; }`
 * + the server-rendered `aria-disabled="false"` (flipped to true
 * by the client controller when the swim's `.collapsed` class is
 * applied) communicate the collapse-precedence contract to both
 * sighted and assistive-tech operators.
 */
export function renderViewToggle(laneId: string, laneName: string): RawHtml {
  return unsafe(html`
    <div class="view-toggle" role="radiogroup"
      aria-label="View mode for ${laneName}"
      data-view-toggle data-lane-id="${laneId}">
      <button class="vt-cell vt-cell--kanban active" type="button"
        role="radio" aria-checked="true" aria-disabled="false"
        aria-label="Kanban view"
        data-view-mode="kanban" data-lane-id="${laneId}">
        <span class="vt-icon" aria-hidden="true">▦</span>
        <span class="vt-label">Kanban</span>
      </button>
      <button class="vt-cell vt-cell--list" type="button"
        role="radio" aria-checked="false" aria-disabled="false"
        aria-label="List view"
        data-view-mode="list" data-lane-id="${laneId}">
        <span class="vt-icon" aria-hidden="true">≡</span>
        <span class="vt-label">List</span>
      </button>
    </div>`);
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

export function renderSwimlane(
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
  // Per Task 5.1B: the server-default view-mode class is `view-
  // kanban` — the client controller post-DOMContentLoaded mirrors
  // the operator's per-lane localStorage override OR the viewport-
  // aware default (mobile→list). CSS toggles which body renders
  // via `.swim.view-kanban .list-body { display: none }` and
  // `.swim.view-list .stage-grid { display: none }`. Both bodies
  // are emitted at server time so the controller flips one class
  // instead of mutating DOM (mirrors the dual swim+stub pattern
  // AUDIT-02 landed for focus toggle).
  return unsafe(html`
    <article class="swim swim--${template.id} view-kanban${unsafe(focusClass)}"
      data-lane-id="${lane.id}"
      data-template-id="${template.id}">
      <div class="swim-head">
        <span class="glyph" aria-hidden="true">${laneGlyph(template.id)}</span>
        <span class="name">${lane.name}</span>
        <span class="tag">${tag}</span>
        <span class="quick-meta">${meta}</span>
        ${renderViewToggle(lane.id, lane.name)}
        <!-- 5.1C slot: + new compose chip lands here. -->
        <button class="collapse-chev" type="button"
          aria-expanded="true"
          aria-label="Collapse ${lane.name} lane"
          data-collapse-target="lane"
          data-lane-id="${lane.id}"
          data-lane-name="${lane.name}">▾</button>
      </div>
      ${renderSwimCompact(bucket)}
      <div class="stage-grid" data-stage-grid>${unsafe(stagesRaw)}</div>
      ${renderListBody(bucket, defaultSite)}
    </article>`);
}

export function renderSwimStub(row: LaneRailRow, focusHidden: boolean): RawHtml {
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
