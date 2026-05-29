/**
 * Per-lane Edit form renderer for `/dev/lanes` (Phase 6 Task 6.3
 * step 6.3.3).
 *
 * Each active or archived lane row gets an inline edit form
 * rendered in a hidden sibling `<tr>`. The row's Edit button
 * toggles the form's visibility client-side.
 *
 * The form is a CLIENT-SIDE copy-builder. Per THESIS Consequence 2
 * the studio never mutates state — the form's copy button produces
 * `/deskwork:lane update <id> [--name <label>] [--template <id>]
 * [--content-dir <path>]` with ONLY the fields that differ from
 * the current lane config. The client controller in `lanes-page.ts`
 * compares the form's live values against `data-current-*`
 * attributes on each field and rebuilds the slash command on
 * every change event.
 *
 * The lane's `id` is immutable (per Task 6.1's CLI contract); the
 * form does not present an id field.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { LaneRow } from './data.ts';

export function renderEditForm(
  row: LaneRow,
  availableTemplates: readonly string[],
): RawHtml {
  const templateOptions = availableTemplates.map(
    (id) =>
      unsafe(
        html`<option value="${id}"${unsafe(id === row.pipelineTemplate ? ' selected' : '')}>${id}</option>`,
      ),
  );

  return unsafe(html`
    <section
      class="lanes-form lanes-form--edit"
      id="lanes-edit-form-${row.id}"
      data-lanes-edit-form
      data-lane-id="${row.id}"
      aria-labelledby="lanes-edit-form-heading-${row.id}"
    >
      <header class="lanes-form-head">
        <h3 class="lanes-form-heading" id="lanes-edit-form-heading-${row.id}">
          Edit <code>${row.id}</code>
        </h3>
        <p class="lanes-form-desc">
          Mutate <code>name</code> / <code>template</code> / <code>contentDir</code>.
          The slash command below carries only the fields that changed.
        </p>
      </header>
      <div class="lanes-form-grid">
        <label class="lanes-field">
          <span class="lanes-field-label">Name</span>
          <input
            class="lanes-input"
            type="text"
            name="name"
            data-lanes-field="name"
            data-current="${row.name}"
            value="${row.name}"
            autocomplete="off"
          >
        </label>
        <label class="lanes-field">
          <span class="lanes-field-label">Pipeline template</span>
          <select
            class="lanes-select"
            name="template"
            data-lanes-field="template"
            data-current="${row.pipelineTemplate}"
          >
            ${templateOptions}
          </select>
        </label>
        <label class="lanes-field">
          <span class="lanes-field-label">Content dir</span>
          <input
            class="lanes-input"
            type="text"
            name="contentDir"
            data-lanes-field="contentDir"
            data-current="${row.contentDir}"
            value="${row.contentDir}"
            autocomplete="off"
            spellcheck="false"
          >
        </label>
      </div>
      <div class="lanes-form-preview">
        <span class="lanes-form-preview-label">Command preview</span>
        <code
          class="lanes-form-preview-cmd"
          data-lanes-preview
          data-lane-id="${row.id}"
        >/deskwork:lane update ${row.id}</code>
      </div>
      <div class="lanes-form-actions">
        <button
          class="lanes-btn lanes-btn--primary"
          type="button"
          data-lanes-copy-button="edit"
          data-lane-id="${row.id}"
        >Copy command</button>
        <button
          class="lanes-btn lanes-btn--secondary"
          type="button"
          data-lane-edit-cancel
          data-lane-id="${row.id}"
        >Close</button>
      </div>
    </section>`);
}
