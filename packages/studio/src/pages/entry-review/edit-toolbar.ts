/**
 * Edit-mode toolbar for the entry-keyed press-check surface (Phase 34a — T7).
 *
 * Relocated from `pages/review.ts:renderEditToolbar`. The toolbar lives
 * ABOVE the page-grid; the client (`entry-review-client.ts`) flips its
 * `[hidden]` attribute on enter/exit. Source / Split / Preview tabs +
 * Outline / Focus / Save / Cancel actions. Consumes the existing
 * `editorial-review.css` rules unchanged.
 *
 * Save semantics: the entry-keyed model's `iterateEntry` reads on-disk
 * content, not a request body, so the legacy edit-in-browser-then-save
 * flow has no entry-keyed equivalent. The Save button is rendered
 * `disabled` with a tooltip pointing at issue #174 (operator decision
 * needed on the save shape). Edit mode itself still works — the source
 * pane and the rendered preview pane are functional — only the Save
 * action is intentionally inert pending the design decision.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

const SAVE_ISSUE_URL =
  'https://github.com/audiocontrol-org/deskwork/issues/174';
const SAVE_TOOLTIP =
  `Save semantics for the entry-keyed surface are pending design — see ${SAVE_ISSUE_URL}`;

export function renderEditToolbar(outlineHasContent: boolean): RawHtml {
  const outlineBtnAttrs = outlineHasContent ? '' : ' hidden';
  return unsafe(html`
    <div class="er-edit-toolbar" data-edit-toolbar hidden>
      <div class="er-edit-modes" role="tablist" aria-label="Editor mode">
        <button class="er-edit-mode-btn" data-edit-view="source" type="button" aria-pressed="true">Source</button>
        <button class="er-edit-mode-btn" data-edit-view="split" type="button" aria-pressed="false">Split</button>
        <button class="er-edit-mode-btn" data-edit-view="preview" type="button" aria-pressed="false">Preview</button>
      </div>
      <div class="er-edit-actions">
        <button class="er-btn er-btn-small" data-action="outline-drawer" type="button" title="Show the outline for reference (O)" aria-pressed="false"${unsafe(outlineBtnAttrs)}>Outline ↗</button>
        <button class="er-btn er-btn-small" data-action="focus-mode" type="button" title="Distraction-free mode (Shift+F)" aria-pressed="false">Focus ⛶</button>
        <button class="er-btn er-btn-primary" data-action="save-version" type="button" disabled aria-disabled="true" title="${SAVE_TOOLTIP}">Save as new version</button>
        <button class="er-btn" data-action="cancel-edit" type="button">Cancel</button>
        <span class="er-edit-hint" data-edit-hint></span>
      </div>
    </div>`);
}
