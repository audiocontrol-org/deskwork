/**
 * "New pipeline template" form renderer for `/dev/pipelines` (Phase 6
 * Task 6.4 step 6.4.1).
 *
 * Client-side copy-builder mirroring the lanes-page New form. Per
 * THESIS Consequence 2 the studio never mutates state — the form's
 * Copy button clipboards the equivalent
 * `/deskwork:pipeline create <id> --shape "Stage1,Stage2,..."
 * [--name <label>] [--description <text>]` slash command.
 *
 * Required fields: id, shape. Name and description are optional and
 * the CLI uses sensible defaults when omitted; the preview leaves
 * them off when empty.
 *
 * The client controller rebuilds the preview on every change event;
 * the operator-supplied values flow through `quoteValue` for symmetric
 * quoting across all four fields.
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderNewPipelineForm(): RawHtml {
  return unsafe(html`
    <section class="pipelines-form pipelines-form--new" data-pipelines-new-form aria-labelledby="pipelines-new-form-heading">
      <header class="pipelines-form-head">
        <h2 class="pipelines-form-heading" id="pipelines-new-form-heading">New pipeline template</h2>
        <p class="pipelines-form-desc">
          A new template lives at <code>.deskwork/pipelines/&lt;id&gt;.json</code>
          and becomes a project override. Fields update the slash command
          below; copy it and paste into Claude Code to run.
        </p>
      </header>
      <div class="pipelines-form-grid">
        <label class="pipelines-field">
          <span class="pipelines-field-label">Template id</span>
          <input
            class="pipelines-input"
            type="text"
            name="id"
            data-pipelines-field="new-id"
            placeholder="e.g. mockup-workflow"
            pattern="[a-z0-9][a-z0-9-]*"
            required
            autocomplete="off"
            spellcheck="false"
          >
          <span class="pipelines-field-hint">kebab-case, starts with [a-z0-9]</span>
        </label>
        <label class="pipelines-field">
          <span class="pipelines-field-label">Shape (comma-separated linearStages)</span>
          <input
            class="pipelines-input"
            type="text"
            name="shape"
            data-pipelines-field="new-shape"
            placeholder="Idea,Sketch,Inked,Final"
            required
            autocomplete="off"
            spellcheck="false"
          >
          <span class="pipelines-field-hint">Last stage is terminal; "Cancelled" is appended as off-pipeline by default.</span>
        </label>
        <label class="pipelines-field">
          <span class="pipelines-field-label">Name (optional)</span>
          <input
            class="pipelines-input"
            type="text"
            name="name"
            data-pipelines-field="new-name"
            placeholder="Human-readable label"
            autocomplete="off"
          >
          <span class="pipelines-field-hint">defaults to the id</span>
        </label>
        <label class="pipelines-field">
          <span class="pipelines-field-label">Description (optional)</span>
          <input
            class="pipelines-input"
            type="text"
            name="description"
            data-pipelines-field="new-description"
            placeholder="Short description"
            autocomplete="off"
          >
        </label>
      </div>
      <div class="pipelines-form-preview">
        <span class="pipelines-form-preview-label">Command preview</span>
        <code class="pipelines-form-preview-cmd" data-pipelines-preview="new">/deskwork:pipeline create &lt;id&gt; --shape &lt;stages&gt;</code>
      </div>
      <div class="pipelines-form-actions">
        <button
          class="pipelines-btn pipelines-btn--primary"
          type="button"
          data-pipelines-copy-button="new"
        >Copy command</button>
      </div>
    </section>`);
}
