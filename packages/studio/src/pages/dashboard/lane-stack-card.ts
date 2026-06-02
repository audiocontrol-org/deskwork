/**
 * Mobile lane-stack renderer — Phase 5 Task 5.1B mobile-variant
 * (AUDIT-20260528-10).
 *
 * Closes AUDIT-20260528-10: per the D3 Press Bay brief
 * (`docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/brief.md:14`)
 * mobile renders a vertical **lane-stack** of accordion sections,
 * NOT a CSS-adapted version of the desktop swimlane markup. This
 * module emits the brief-contracted mobile DOM shape:
 *
 *   <section class="lane-stack" data-lane-stack>
 *     <article class="lane-section" data-lane-section data-lane-id="…">
 *       <header class="lane-head" data-lane-head>
 *         <span class="lh-glyph">…</span>
 *         <span class="lh-name">…</span>
 *         <span class="lh-count">N entries</span>
 *         <button class="lh-chev" aria-expanded="true"
 *           data-collapse-target="lane-section">▾</button>
 *         <button class="lh-compose" data-swim-compose>+ new</button>
 *         <div class="lh-view-toggle">▦ / ≡</div>
 *       </header>
 *       <div class="lane-body" data-lane-body>
 *         …list-mode stage groups…
 *       </div>
 *     </article>
 *   </section>
 *
 * Per `.claude/rules/affordance-placement.md`: every affordance
 * (chevron, compose chip, view-toggle) lives ON the lane-head — the
 * lane-section's own chrome — not in a separate toolbar.
 *
 * Server-render strategy: this lane-stack markup AND the desktop
 * swim-bay markup are BOTH emitted by the swimlane shell. CSS gates
 * visibility — `.lane-stack { display: none }` on desktop;
 * `.swim-bay-body { display: none }` plus `.lane-stack { display: block }`
 * on mobile. The server can't know the viewport, so it emits both
 * and lets CSS decide.
 *
 * Per the brief: "Defaults are viewport-aware: desktop kanban, mobile
 * list". The lane-body renders LIST-MODE only — the mobile accordion
 * is an alternative DOM tree, not a CSS reskin of the desktop swim's
 * stage-grid+list-body dual body. Reusing `renderListBody` produces
 * the same per-stage `.lb-group` markup the existing list-mode CSS
 * already styles, so the mobile body inherits all of list-mode's
 * styling without duplication.
 *
 * The accordion contract uses the `hidden` attribute (not CSS-only
 * display:none) so screen readers skip the collapsed body — per the
 * brief's a11y note and the existing `.collapse-chev` accessibility
 * primitives in `swimlane-collapse.ts`.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { laneGlyph } from './lane-glyph.ts';
import { renderListBody } from './swimlane-list-body.ts';
import type { LaneBucket } from './lane-data.ts';

/**
 * Per-lane mobile compose chip. Same clipboard payload as the
 * desktop `.swim-compose` chip (Task 5.1C) so the existing
 * `initSwimlaneCompose` controller wires it transparently — the
 * controller's selector `.swim-compose[data-swim-compose]` matches
 * either DOM tree.
 *
 * The lane-head version carries the same `data-lane-id` +
 * `data-first-stage` attributes the desktop chip carries, plus a
 * lane-section-scoped class `.lh-compose` so the mobile CSS can
 * apply size + position tweaks without leaking into desktop styles.
 *
 * Throws on empty `template.linearStages` so the no-fallback rule
 * is preserved.
 */
function renderLaneHeadCompose(
  laneId: string,
  laneName: string,
  firstLinearStage: string,
): RawHtml {
  return unsafe(html`
    <button class="swim-compose lh-compose" type="button"
      aria-label="Compose new entry in ${laneName}"
      data-swim-compose
      data-lane-id="${laneId}"
      data-first-stage="${firstLinearStage}">
      <span class="sc-icon" aria-hidden="true">+</span>
      <span class="sc-label">new</span>
    </button>`);
}

/**
 * Per-lane mobile view-toggle. Same `role="radiogroup"` + `data-
 * view-toggle` + per-cell `data-view-mode` attributes the desktop
 * `.view-toggle` carries, so `initSwimlaneViewToggle` wires the
 * mobile toggle transparently.
 *
 * Important: the desktop view-toggle's apply step keys off the
 * parent `.swim[data-lane-id]` element and swaps `.view-kanban` /
 * `.view-list` classes on it. The mobile lane-section is a separate
 * DOM tree; mobile defaults to list (per the brief). The mobile
 * lane-body is list-only by construction — there is no kanban
 * equivalent in the mobile lane-stack — so the view-toggle here is
 * a visual remnant intentionally retained as a hook for future
 * kanban-in-mobile work. Until that lands, both cells reflect the
 * mobile-default (list) and the active state stays in lockstep with
 * the desktop swim's `.view-list` via the shared client controller.
 *
 * Per the brief: mobile defaults to LIST view; desktop defaults to
 * KANBAN. The server-default `aria-checked` here is `list` so that
 * if JS never loads the visible state still reads correctly on
 * mobile. The desktop swim's renderer emits `aria-checked="true"`
 * on kanban; the client controller reconciles both at DOMContentLoaded.
 */
function renderLaneHeadViewToggle(laneId: string, laneName: string): RawHtml {
  return unsafe(html`
    <div class="view-toggle lh-view-toggle" role="radiogroup"
      aria-label="View mode for ${laneName}"
      data-view-toggle data-lane-id="${laneId}">
      <button class="vt-cell vt-cell--kanban" type="button"
        role="radio" aria-checked="false" aria-disabled="false"
        aria-label="Kanban view"
        data-view-mode="kanban" data-lane-id="${laneId}">
        <span class="vt-icon" aria-hidden="true">▦</span>
        <span class="vt-label">Kanban</span>
      </button>
      <button class="vt-cell vt-cell--list active" type="button"
        role="radio" aria-checked="true" aria-disabled="false"
        aria-label="List view"
        data-view-mode="list" data-lane-id="${laneId}">
        <span class="vt-icon" aria-hidden="true">≡</span>
        <span class="vt-label">List</span>
      </button>
    </div>`);
}

/**
 * Per-lane empty-state CTA inside the mobile lane-body. Mirrors the
 * desktop `.swim-empty-cta` markup so `initSwimlaneCompose` wires
 * the mobile CTA transparently — the controller's selector
 * `.swim-empty-cta .sec-cta[data-swim-empty-copy]` matches either
 * DOM tree.
 */
function renderLaneStackEmptyCta(
  laneId: string,
  laneName: string,
): RawHtml {
  return unsafe(html`
    <div class="swim-empty-cta lane-empty-cta" data-swim-empty-cta>
      <p class="sec-msg">Create your first entry in this lane.</p>
      <button class="sec-cta" type="button"
        aria-label="Compose first entry in ${laneName}"
        data-swim-empty-copy
        data-lane-id="${laneId}">
        <span class="sec-icon" aria-hidden="true">+</span>
        <span class="sec-label">Create your first entry</span>
      </button>
      <p class="sec-hint">copies <code>/deskwork:add --lane ${laneId}</code> to your clipboard</p>
    </div>`);
}

/**
 * Render the mobile lane-section accordion for a single lane. The
 * lane-head carries the chevron / compose / view-toggle affordances;
 * the lane-body is server-rendered as visible (`aria-expanded="true"`
 * + no `hidden` attribute) and the client controller (`lane-stack.ts`)
 * applies any persisted collapse state at DOMContentLoaded.
 *
 * `focusHidden` mirrors the desktop swim's `is-focus-hidden` class —
 * a lane that's been removed from the operator's focus set on
 * desktop is also stowed in the mobile lane-stack so a shared focus
 * preset behaves consistently across viewport classes.
 */
export function renderLaneSection(
  bucket: LaneBucket,
  defaultSite: string,
  focusHidden: boolean,
): RawHtml {
  const { lane, template } = bucket;
  const firstLinearStage = template.linearStages[0];
  if (firstLinearStage === undefined) {
    throw new Error(
      `pipeline template "${template.id}" has empty linearStages — `
      + 'the schema enforces a minimum of 1; this is a programming '
      + 'error reaching the lane-stack renderer',
    );
  }

  const focusClass = focusHidden ? ' is-focus-hidden' : '';
  const entries = bucket.entryCount;
  const meta = entries === 1 ? '1 entry' : `${entries} entries`;

  // The lane-body renders LIST-mode only on mobile (per the brief's
  // "mobile defaults to list" contract). The renderListBody helper
  // emits the same `.lb-group` per-stage markup the desktop list
  // view uses, so the mobile body inherits all of list-mode's
  // styling without duplication.
  const listBodyRaw = renderListBody(bucket, defaultSite).__raw;
  const emptyCtaRaw = bucket.entryCount === 0
    ? renderLaneStackEmptyCta(lane.id, lane.name).__raw
    : '';

  return unsafe(html`
    <article class="lane-section${unsafe(focusClass)}"
      data-lane-section
      data-lane-id="${lane.id}"
      data-template-id="${template.id}">
      <header class="lane-head" data-lane-head>
        <span class="lh-glyph" aria-hidden="true">${laneGlyph(template.id)}</span>
        <span class="lh-name">${lane.name}</span>
        <span class="lh-count">${meta}</span>
        <button class="lh-chev collapse-chev" type="button"
          aria-expanded="true"
          aria-label="Collapse ${lane.name} lane"
          aria-controls="lane-body-${lane.id}"
          data-collapse-target="lane-section"
          data-lane-id="${lane.id}"
          data-lane-name="${lane.name}">▾</button>
        ${renderLaneHeadCompose(lane.id, lane.name, firstLinearStage)}
        ${renderLaneHeadViewToggle(lane.id, lane.name)}
      </header>
      <div class="lane-body" data-lane-body
        id="lane-body-${lane.id}">
        ${unsafe(emptyCtaRaw)}
        ${unsafe(listBodyRaw)}
      </div>
    </article>`);
}

/**
 * Top-level mobile lane-stack renderer. Emits one `<section
 * class="lane-stack">` listing every lane in the order the desktop
 * bay receives them — the same `LaneBucketsResult` iteration order
 * the swimlane shell walks. The mobile shell hides itself on desktop
 * (CSS gate) so it's a pure-mobile alternative DOM tree, not a
 * second renderer the desktop must work around.
 *
 * The `focused` set parameter mirrors the desktop bay's focus
 * decisions; mobile sections take `is-focus-hidden` from the same
 * focus state so a preset applied across viewport classes behaves
 * identically.
 */
export function renderLaneStack(
  byLane: ReadonlyMap<string, LaneBucket>,
  focused: ReadonlySet<string>,
  defaultSite: string,
): RawHtml {
  const sectionsRaw = Array.from(byLane.entries())
    .map(([id, bucket]) => {
      const focusHidden = !focused.has(id);
      return renderLaneSection(bucket, defaultSite, focusHidden).__raw;
    })
    .join('');
  return unsafe(html`
    <section class="lane-stack" data-lane-stack>
      ${unsafe(sectionsRaw)}
    </section>`);
}
