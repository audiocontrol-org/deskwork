/**
 * Lane-visibility rail renderer for the multi-lane swimlane dashboard
 * (Phase 5 Task 5.1).
 *
 * Emits the left rail with one `.rail-lane` row per lane. Each row
 * carries:
 *   - the press-check lane glyph (`.r-glyph`)
 *   - the lane name + entry count
 *   - the dual-state eye-toggle button (`.r-eye-btn`, F6 a11y fix —
 *     a real focusable `<button>` with `aria-label`; the visible /
 *     hidden glyphs render as `aria-hidden` siblings whose display
 *     is driven by the parent `.rail-lane[data-lane-visible]` CSS)
 *   - a drag handle (`.rail-drag`). Task 5.4 wires the rail-level
 *     HTML5 native drag-and-drop handler — the whole row carries
 *     `draggable="true"` per the HTML5 DnD contract (the browser only
 *     starts a drag when the source root opts in). The handle glyph
 *     is the operator's visual cue ("grab here"); the CSS surfaces
 *     `cursor: grab` on `.rail-drag` to reinforce that mental model.
 *
 * The rail row itself remains a `role="button"` div (the whole row
 * is the focus toggle). Keyboard activation (Enter / Space) is wired
 * in the client at `plugins/deskwork-studio/public/src/dashboard/
 * swimlane.ts:bindRailEyeToggles`.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import { laneGlyph } from './lane-glyph.ts';

export interface LaneRailRow {
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

function renderRailRow(row: LaneRailRow): RawHtml {
  const classes = row.inFocus ? 'rail-lane focused' : 'rail-lane';
  // F6 a11y: the visibility toggle is a real `<button>` with an
  // accessible name. The inner `<span class="r-eye-visible">` /
  // `<span class="r-eye-hidden">` glyphs are decorative; CSS picks
  // which one shows based on the parent `.rail-lane
  // [data-lane-visible]` attribute the client controller updates on
  // click.
  //
  // Task 5.4 drag handle: HTML5 native DnD requires the source root
  // to carry `draggable="true"`; the visible `.rail-drag` glyph is
  // the operator's "grab here" cue (cursor: grab in CSS). Whole-row
  // drag is the pragmatic call — the browser fires dragstart from
  // any descendant; the visual handle anchors the mental model. The
  // reorder controller lives in
  // `plugins/deskwork-studio/public/src/dashboard/swimlane-drag.ts`.
  const eyeLabel = `Toggle visibility for ${row.name} lane`;
  return unsafe(html`
    <div class="${classes}" role="button" tabindex="0"
      draggable="true"
      data-rail-lane="${row.id}"
      aria-pressed="${row.inFocus ? 'true' : 'false'}"
      data-lane-visible="true">
      <button class="r-eye-btn" type="button"
        data-rail-eye="${row.id}" aria-label="${eyeLabel}"
        ><span class="r-eye-visible" aria-hidden="true">●</span><span class="r-eye-hidden" aria-hidden="true">○</span></button>
      <span class="r-glyph" aria-hidden="true">${laneGlyph(row.templateId)}</span>
      <span class="r-name">${row.name}</span>
      <span class="r-count">${row.entryCount}</span>
      <span class="rail-drag" aria-hidden="true">⋮⋮</span>
    </div>`);
}

/**
 * Render the rail head's preset-save / preset-list surface (Phase 5
 * Task 5.5). Per `.claude/rules/affordance-placement.md`, the Save +
 * Load affordances live on the component they control — the rail —
 * not in the page-level masthead. The Save button captures the
 * current four-axis state (visible / focused / view-mode / collapse)
 * as a named preset; the per-row Load buttons re-apply a saved
 * preset; the per-row Delete buttons remove a preset.
 *
 * The list container is server-rendered empty + populated by the
 * client controller (`swimlane-presets.ts`) on init. The empty
 * state is `<span class="preset-empty">No saved presets</span>`,
 * matching what the client renders before any preset exists. This
 * means the SSR output is operator-perceivable on first paint
 * (before client JS runs) and re-rendered identically by the client
 * once it boots — no flash-of-empty-content.
 */
function renderPresetSurface(): RawHtml {
  return unsafe(html`
    <div class="rail-presets" data-rail-presets>
      <button class="preset-save" type="button"
        data-preset-save
        aria-label="Save current view as preset">+ Save as preset</button>
      <div class="preset-list" data-preset-list>
        <span class="preset-empty">No saved presets</span>
      </div>
    </div>`);
}

export function renderRail(
  laneRows: readonly LaneRailRow[],
  laneCount: number,
): RawHtml {
  const rowsRaw = laneRows.map((r) => renderRailRow(r).__raw).join('');
  const presetSurfaceRaw = renderPresetSurface().__raw;
  return unsafe(html`
    <aside class="lane-rail" data-lane-rail>
      <div class="rail-head">
        Lanes
        <span class="rail-head-count" aria-hidden="true">${laneCount} visible</span>
        ${unsafe(presetSurfaceRaw)}
      </div>
      ${unsafe(rowsRaw)}
    </aside>`);
}
