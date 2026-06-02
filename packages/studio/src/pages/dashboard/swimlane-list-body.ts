/**
 * Per-lane list-body renderer for the multi-lane dashboard
 * (Phase 5 Task 5.1B — per-lane kanban ↔ list view toggle).
 *
 * Renders the alternative `<div class="list-body">` shape: every
 * template stage becomes a `<div class="lb-group">` carrying its
 * stage-head (glyph + name + count + per-stage collapse chevron)
 * followed by a `<div class="lb-row">` per entry.
 *
 * Both the kanban `.stage-grid` AND this `.list-body` are emitted
 * server-side for every swimlane; the CSS shows exactly one based
 * on `.swim.view-kanban` vs `.swim.view-list`. The dual-body
 * server render mirrors the dual swim + stub pattern AUDIT-02
 * landed for focus-toggle: both DOM trees pre-exist so the client
 * controller swaps a class instead of mutating markup.
 *
 * The per-stage chevron on `.lb-group` reuses the universal
 * `.collapse-chev` primitive with `data-collapse-target="stage"`
 * — the same controller that powers `.stage-col` collapse handles
 * `.lb-group` once it walks the alternative parent selector.
 *
 * Row shape (per direction-3-press-bay.html mockup lines 1227-1316):
 *
 *   <div class="lb-row">
 *     <span class="lb-title">…</span>
 *     <span class="lb-version">…</span>   // slug — mirrors .e-meta
 *     <span class="lb-state"></span>      // empty per Commandment III
 *     <button class="lb-overflow" …>⋮</button>
 *   </div>
 *
 * Per DESKWORK-STATE-MACHINE.md Commandment III, `reviewState` is
 * RETIRED and per-stage iteration counts are bookkeeping (see
 * `section.ts:50-52` — surfacing them inline was a violation). The
 * `lb-state` span is therefore emitted as a structurally-present
 * but empty slot — the CSS reserves the column width so the row
 * grid stays aligned across rows whose state-derived chrome may
 * land via template-aware verb routing (Task 5.2 generalises
 * `verbsForStage` by template). The slot's emptiness is the
 * correct content under the current state-machine spec; surfacing
 * iteration / reviewState here would be a Commandment-III violation.
 * The `lb-version` span carries the entry's slug — mirroring
 * `swimlane-entry-card.ts:47`'s `<span class="e-meta">${entry.slug}
 * </span>` pattern, so the operator's identifying token is
 * consistent across views.
 *
 * Locked stages carry `.lb-group.locked`; the CSS paints the glyph
 * proof-blue (mockup line 420) — same colour treatment the kanban
 * `.stage-col.locked` rule emits at swimlane-card.ts's `renderStage
 * Col`.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { entryRowLinkMeta } from './entry-link-meta.ts';
import { stageGlyph, GLYPH_OFF } from './swimlane-stage-glyph.ts';
import { renderUnbucketedListGroup } from './swimlane-unbucketed.ts';
import type { LaneBucket } from './lane-data.ts';
import type { Entry } from '@deskwork/core/schema/entry';

/**
 * Per-stage empty-state copy for the list view. Mirrors the kanban
 * column's `STAGE_EMPTY_HINTS` mapping minus the editorial-specific
 * "run the verb" prose — the list-view row already lives next to a
 * group head carrying the stage name, so the empty hint is shorter.
 */
function listEmptyHint(stage: string): string {
  return `Nothing in ${stage.toLowerCase()}.`;
}

function renderListRow(entry: Entry, defaultSite: string): RawHtml {
  void defaultSite;
  const { reviewLink, search } = entryRowLinkMeta(entry);
  // The row is a single `<a>` linking to the entry-review surface.
  // The overflow glyph is decorative chrome — it is NOT an active
  // affordance at this rendering layer. Per AUDIT-20260528-08: the
  // prior `role="button" tabindex="0" aria-label="..."` shape made
  // the span a focusable keyboard target that did nothing (no handler
  // wired here; wiring is intentionally separate work). Keyboard users
  // could tab to it and get nothing back — worse than no affordance.
  // The fix removes the focusable+button semantics so the span is
  // pure decoration; when a real overflow menu is wired in a later
  // pass, the markup can be promoted back to `<button>` (which would
  // require lifting the row out of `<a>` to avoid interactive-inside-
  // interactive — that's the proper restructuring, not a band-aid).
  // `data-lb-overflow` and `data-uuid` are preserved so the future
  // wiring has its data target ready.
  return unsafe(html`
    <a class="lb-row" href="${reviewLink}"
      data-row-shell data-search="${search}"
      data-stage="${entry.currentStage}"
      data-uuid="${entry.uuid}" data-slug="${entry.slug}"
      title="open the review surface">
      <span class="lb-title">${entry.title}</span>
      <span class="lb-version">${entry.slug}</span>
      <span class="lb-state"></span>
      <span class="lb-overflow" aria-hidden="true"
        data-lb-overflow="${entry.uuid}">⋮</span>
    </a>`);
}

function renderEmptyListRow(stage: string): RawHtml {
  return unsafe(html`
    <div class="lb-row empty-state" data-empty-stage-msg
      data-empty-stage="${stage}">${listEmptyHint(stage)}</div>`);
}

/**
 * Per-stage list-group renderer. Emits a `<div class="lb-group">`
 * carrying the stage head (glyph + name + count + collapse chevron)
 * + one `<div class="lb-row">` per entry (or an empty-state row).
 *
 * The collapse chevron carries `data-collapse-target="stage"` so
 * the universal `.collapse-chev` controller in `swimlane-collapse
 * .ts` toggles `.lb-group.collapsed` via the same dispatch the
 * kanban `.stage-col` uses.
 */
function renderListGroup(
  laneId: string,
  stage: string,
  entries: readonly Entry[],
  defaultSite: string,
  glyph: string,
  isLocked: boolean,
  isOffPipeline: boolean,
): RawHtml {
  const emptyClass = entries.length === 0 ? ' empty' : '';
  const lockedClass = isLocked ? ' locked' : '';
  const offClass = isOffPipeline ? ' off-pipeline' : '';
  const body = entries.length === 0
    ? renderEmptyListRow(stage).__raw
    : entries.map((e) => renderListRow(e, defaultSite).__raw).join('');

  return unsafe(html`
    <div class="lb-group${unsafe(emptyClass)}${unsafe(lockedClass)}${unsafe(offClass)}"
      data-lb-group="${stage}">
      <div class="lb-group-head">
        <span class="lb-glyph" aria-hidden="true">${glyph}</span>
        <span class="lb-name">${stage}</span>
        <span class="lb-count">${entries.length}</span>
        <button class="collapse-chev" type="button"
          aria-expanded="true"
          aria-label="Collapse ${stage} group"
          data-collapse-target="stage"
          data-lane-id="${laneId}"
          data-stage-name="${stage}">▾</button>
      </div>
      ${unsafe(body)}
    </div>`);
}

/**
 * Top-level list-body renderer. Walks the lane's template stages
 * (linear first, then off-pipeline) and emits one `.lb-group` per
 * stage. The output is wrapped in `<div class="list-body">` — the
 * sibling of `<div class="stage-grid">` inside each `<article
 * class="swim">`.
 */
export function renderListBody(
  bucket: LaneBucket,
  defaultSite: string,
): RawHtml {
  const { lane, template } = bucket;
  const lockedSet = new Set<string>(template.lockedStages ?? []);
  const groupsRaw = [
    ...template.linearStages.map((stage) =>
      renderListGroup(
        lane.id,
        stage,
        bucket.byStage.get(stage) ?? [],
        defaultSite,
        stageGlyph(stage),
        lockedSet.has(stage),
        false,
      ).__raw,
    ),
    ...template.offPipelineStages.map((stage) =>
      renderListGroup(
        lane.id,
        stage,
        bucket.byStage.get(stage) ?? [],
        defaultSite,
        stageGlyph(stage, GLYPH_OFF),
        // Off-pipeline stages are not part of `lockedStages` (the
        // template schema enforces lockedStages ⊆ linearStages),
        // so this is always false — passed explicitly to keep the
        // signature parallel.
        false,
        true,
      ).__raw,
    ),
    // Per AUDIT-20260530-25: list-view analogue of the kanban
    // unbucketed-tail column. Same data, same operator-diagnosable
    // shape; CSS picks which surface paints via the `.swim.view-list`
    // class. Without this group, switching to the list view re-creates
    // the silent-drop the kanban fix closes.
    renderUnbucketedListGroup(lane.id, bucket.unbucketed).__raw,
  ].join('');

  return unsafe(html`<div class="list-body" data-list-body>${unsafe(groupsRaw)}</div>`);
}
