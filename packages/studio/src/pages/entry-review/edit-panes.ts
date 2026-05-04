/**
 * Edit-mode panes for the entry-keyed press-check surface (Phase 34a — T8).
 *
 * Relocated from `pages/review.ts:renderEditPanes`. The panes-host lives
 * inside the article column (replacing `#draft-body` when editing). The
 * wrapper keeps the `er-edit-mode` class so existing CSS cascades
 * unchanged. The client flips `[hidden]` on the panes wrapper independently
 * of the toolbar.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderEditPanes(): RawHtml {
  return unsafe(html`
    <div class="er-edit-mode" data-edit-panes-host hidden>
      <div class="er-edit-panes" data-edit-panes data-view="source">
        <div class="er-edit-source" data-edit-source aria-label="Markdown source"></div>
        <div class="er-edit-preview" data-edit-preview aria-label="Rendered preview"></div>
      </div>
      <textarea id="draft-edit" data-draft-edit hidden></textarea>
      <div class="er-focus-exit" data-focus-exit aria-hidden="true">
        <button type="button" data-action="exit-focus" title="Exit focus (Esc)">← exit focus</button>
      </div>
      <div class="er-focus-save" data-focus-save aria-hidden="true">
        <button type="button" class="er-btn er-btn-small er-btn-primary" data-action="save-version">Save</button>
        <span class="er-focus-save-hint" data-focus-save-hint></span>
      </div>
    </div>`);
}
