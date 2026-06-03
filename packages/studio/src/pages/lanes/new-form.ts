/**
 * "New lane" form renderer for `/dev/lanes` (Phase 6 Task 6.3 step
 * 6.3.2).
 *
 * The form is a CLIENT-SIDE copy-builder. Per THESIS Consequence 2,
 * the studio never mutates state — the form's submit button copies
 * the equivalent `/deskwork:lane create <id> --template <id>
 * [--scaffold-default markdown=<dir>] [--host <h>] [--name <label>]`
 * slash command to the clipboard. The operator then pastes the command
 * into Claude Code; the agent runs the CLI; the CLI writes the lane
 * config.
 *
 * The form has a live preview <code> element showing the slash
 * command as the operator types. The client controller in
 * `lanes-page.ts` rebuilds the preview on every change event.
 *
 * Required fields: id, template. Per Phase 39 (sites→lanes retirement)
 * a lane carries no `contentDir`; the scaffold default (markdown) and
 * host fields are OPTIONAL — a lane is fully valid with neither. Name
 * is optional and defaults to the id on the CLI side; the preview omits
 * each optional flag when its field is empty.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

interface NewFormInput {
  readonly availableTemplates: readonly string[];
}

export function renderNewLaneForm(input: NewFormInput): RawHtml {
  const templateOptions = input.availableTemplates
    .map(
      (id) =>
        unsafe(html`<option value="${id}">${id}</option>`),
    );

  return unsafe(html`
    <section class="lanes-form lanes-form--new" data-lanes-new-form aria-labelledby="lanes-new-form-heading">
      <header class="lanes-form-head">
        <h2 class="lanes-form-heading" id="lanes-new-form-heading">New lane</h2>
        <p class="lanes-form-desc">
          Configure a new lane. Fields update the slash command below;
          copy it and paste into Claude Code to run.
        </p>
      </header>
      <div class="lanes-form-grid">
        <label class="lanes-field">
          <span class="lanes-field-label">Lane id</span>
          <input
            class="lanes-input"
            type="text"
            name="id"
            data-lanes-field="id"
            placeholder="e.g. mockups"
            pattern="[a-z0-9][a-z0-9-]*"
            required
            autocomplete="off"
            spellcheck="false"
          >
          <span class="lanes-field-hint">kebab-case, starts with [a-z0-9]</span>
        </label>
        <label class="lanes-field">
          <span class="lanes-field-label">Name (optional)</span>
          <input
            class="lanes-input"
            type="text"
            name="name"
            data-lanes-field="name"
            placeholder="Human-readable label"
            autocomplete="off"
          >
          <span class="lanes-field-hint">defaults to the id</span>
        </label>
        <label class="lanes-field">
          <span class="lanes-field-label">Pipeline template</span>
          <select
            class="lanes-select"
            name="template"
            data-lanes-field="template"
            required
          >
            <option value="" disabled selected>Pick a template…</option>
            ${templateOptions}
          </select>
          <span class="lanes-field-hint">union of plugin presets and project overrides</span>
        </label>
        <label class="lanes-field">
          <span class="lanes-field-label">Scaffold default (markdown, optional)</span>
          <input
            class="lanes-input"
            type="text"
            name="scaffoldMarkdown"
            data-lanes-field="scaffoldMarkdown"
            placeholder="e.g. src/content/blog"
            autocomplete="off"
            spellcheck="false"
          >
          <span class="lanes-field-hint">where /deskwork:add drops a NEW markdown file; never resolution</span>
        </label>
        <label class="lanes-field">
          <span class="lanes-field-label">Host (optional)</span>
          <input
            class="lanes-input"
            type="text"
            name="host"
            data-lanes-field="host"
            placeholder="e.g. example.com"
            autocomplete="off"
            spellcheck="false"
          >
          <span class="lanes-field-hint">present only when this lane publishes a website</span>
        </label>
      </div>
      <div class="lanes-form-preview">
        <span class="lanes-form-preview-label">Command preview</span>
        <code class="lanes-form-preview-cmd" data-lanes-preview>/deskwork:lane create &lt;id&gt; --template &lt;template&gt;</code>
      </div>
      <div class="lanes-form-actions">
        <button
          class="lanes-btn lanes-btn--primary"
          type="button"
          data-lanes-copy-button="new"
          aria-controls="lanes-new-form"
        >Copy command</button>
      </div>
    </section>`);
}
