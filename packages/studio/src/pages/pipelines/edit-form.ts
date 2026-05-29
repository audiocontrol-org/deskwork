/**
 * Per-template Edit form renderer for `/dev/pipelines` (Phase 6 Task
 * 6.4 step 6.4.2 + step 6.4.3 — mutation side).
 *
 * Each healthy template row gets an inline edit panel rendered in a
 * hidden sibling `<tr>`. The panel exposes the FIVE mutually-exclusive
 * `pipeline update` operations as their own `<details>` sub-forms.
 * The CLI accepts only one operation per invocation, so the panel
 * reflects that contract by giving each operation its own preview +
 * Copy button. The operator runs the operations one at a time.
 *
 * Sub-forms (mirroring the CLI flags):
 *
 *   1. Add stage — `--add-stage <name> [--position N]`
 *   2. Rename stage — `--rename-stage <from> --to-stage <to>`
 *   3. Remove stage — `--remove-stage <name>`
 *   4. Set locked — `--set-locked "<s1>,<s2>,..."`
 *   5. Set off-pipeline — `--set-off-pipeline "<s1>,<s2>,..."`
 *
 * The five panels form a single-open accordion: clicking one opens
 * it and closes any previously-open sibling. The accordion is wired
 * client-side; server-side every panel renders closed.
 *
 * Plugin-preset templates get a notice at the top of the panel
 * directing the operator to `/deskwork:customize pipeline <id>`
 * before mutating — the CLI refuses to mutate a plugin preset, and
 * surfacing the refusal here means the operator doesn't have to
 * paste a copy command into Claude Code to learn the gate exists.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { PipelineRow } from './data.ts';

function renderCustomizeNotice(row: PipelineRow): RawHtml {
  if (row.source !== 'plugin-preset') return unsafe('');
  return unsafe(html`
    <div class="pipelines-edit-notice" role="status">
      <strong>Plugin preset — customize first.</strong>
      Plugin-shipped templates are read-only. To mutate, run
      <code>/deskwork:customize pipeline ${row.id}</code> first;
      that writes a project-override under <code>.deskwork/pipelines/${row.id}.json</code>
      which the update operations below can then mutate.
    </div>`);
}

function renderStageOptions(
  stages: readonly string[],
  selected?: string,
): readonly RawHtml[] {
  return stages.map((stage) =>
    unsafe(
      html`<option value="${stage}"${unsafe(stage === selected ? ' selected' : '')}>${stage}</option>`,
    ),
  );
}

function renderAddPanel(row: PipelineRow): RawHtml {
  return unsafe(html`
    <details class="pipelines-edit-op" data-pipelines-op="add">
      <summary class="pipelines-edit-op-summary">Add stage</summary>
      <div class="pipelines-edit-op-body" data-pipelines-op-form="add" data-pipeline-id="${row.id}">
        <div class="pipelines-form-grid">
          <label class="pipelines-field">
            <span class="pipelines-field-label">Stage name</span>
            <input
              class="pipelines-input"
              type="text"
              data-pipelines-field="add-name"
              placeholder="e.g. Review"
              autocomplete="off"
              spellcheck="false"
            >
          </label>
          <label class="pipelines-field">
            <span class="pipelines-field-label">Position (optional)</span>
            <input
              class="pipelines-input"
              type="number"
              min="0"
              max="${row.linearStages.length}"
              data-pipelines-field="add-position"
              placeholder="${row.linearStages.length}"
            >
            <span class="pipelines-field-hint">0-indexed; defaults to append</span>
          </label>
        </div>
        <div class="pipelines-form-preview">
          <span class="pipelines-form-preview-label">Command preview</span>
          <code class="pipelines-form-preview-cmd" data-pipelines-preview="add" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --add-stage &lt;name&gt;</code>
        </div>
        <div class="pipelines-form-actions">
          <button
            class="pipelines-btn pipelines-btn--primary"
            type="button"
            data-pipelines-copy-button="add"
            data-pipeline-id="${row.id}"
          >Copy command</button>
        </div>
      </div>
    </details>`);
}

function renderRenamePanel(row: PipelineRow): RawHtml {
  const allStages = [...row.linearStages, ...row.offPipelineStages];
  const fromOptions = renderStageOptions(allStages);
  return unsafe(html`
    <details class="pipelines-edit-op" data-pipelines-op="rename">
      <summary class="pipelines-edit-op-summary">Rename stage</summary>
      <div class="pipelines-edit-op-body" data-pipelines-op-form="rename" data-pipeline-id="${row.id}">
        <div class="pipelines-form-grid">
          <label class="pipelines-field">
            <span class="pipelines-field-label">From</span>
            <select class="pipelines-select" data-pipelines-field="rename-from" required>
              <option value="" disabled selected>Pick a stage…</option>
              ${fromOptions}
            </select>
          </label>
          <label class="pipelines-field">
            <span class="pipelines-field-label">To</span>
            <input
              class="pipelines-input"
              type="text"
              data-pipelines-field="rename-to"
              placeholder="new name"
              autocomplete="off"
              spellcheck="false"
            >
          </label>
        </div>
        <div class="pipelines-form-preview">
          <span class="pipelines-form-preview-label">Command preview</span>
          <code class="pipelines-form-preview-cmd" data-pipelines-preview="rename" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --rename-stage &lt;from&gt; --to-stage &lt;to&gt;</code>
        </div>
        <div class="pipelines-form-actions">
          <button
            class="pipelines-btn pipelines-btn--primary"
            type="button"
            data-pipelines-copy-button="rename"
            data-pipeline-id="${row.id}"
          >Copy command</button>
        </div>
      </div>
    </details>`);
}

function renderRemovePanel(row: PipelineRow): RawHtml {
  const allStages = [...row.linearStages, ...row.offPipelineStages];
  const options = renderStageOptions(allStages);
  return unsafe(html`
    <details class="pipelines-edit-op" data-pipelines-op="remove">
      <summary class="pipelines-edit-op-summary">Remove stage</summary>
      <div class="pipelines-edit-op-body" data-pipelines-op-form="remove" data-pipeline-id="${row.id}">
        <div class="pipelines-form-grid">
          <label class="pipelines-field">
            <span class="pipelines-field-label">Stage</span>
            <select class="pipelines-select" data-pipelines-field="remove-name" required>
              <option value="" disabled selected>Pick a stage…</option>
              ${options}
            </select>
          </label>
        </div>
        <div class="pipelines-form-preview">
          <span class="pipelines-form-preview-label">Command preview</span>
          <code class="pipelines-form-preview-cmd" data-pipelines-preview="remove" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --remove-stage &lt;name&gt;</code>
        </div>
        <div class="pipelines-form-actions">
          <button
            class="pipelines-btn pipelines-btn--primary"
            type="button"
            data-pipelines-copy-button="remove"
            data-pipeline-id="${row.id}"
          >Copy command</button>
        </div>
      </div>
    </details>`);
}

function renderSetLockedPanel(row: PipelineRow): RawHtml {
  const lockedSet = new Set(row.lockedStages);
  const checkboxes = row.linearStages.map((stage) =>
    unsafe(html`
      <label class="pipelines-checkbox-field">
        <input
          type="checkbox"
          value="${stage}"
          data-pipelines-field="set-locked"
          ${unsafe(lockedSet.has(stage) ? 'checked' : '')}
        >
        <span>${stage}</span>
      </label>`),
  );
  return unsafe(html`
    <details class="pipelines-edit-op" data-pipelines-op="set-locked">
      <summary class="pipelines-edit-op-summary">Set locked stages</summary>
      <div class="pipelines-edit-op-body" data-pipelines-op-form="set-locked" data-pipeline-id="${row.id}">
        <div class="pipelines-field">
          <span class="pipelines-field-label">Tick the linearStages to lock (pre-terminal review-freeze stages)</span>
          <div class="pipelines-checkbox-grid">
            ${checkboxes}
          </div>
        </div>
        <div class="pipelines-form-preview">
          <span class="pipelines-form-preview-label">Command preview</span>
          <code class="pipelines-form-preview-cmd" data-pipelines-preview="set-locked" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --set-locked &lt;comma-sep&gt;</code>
        </div>
        <div class="pipelines-form-actions">
          <button
            class="pipelines-btn pipelines-btn--primary"
            type="button"
            data-pipelines-copy-button="set-locked"
            data-pipeline-id="${row.id}"
          >Copy command</button>
        </div>
      </div>
    </details>`);
}

function renderSetOffPanel(row: PipelineRow): RawHtml {
  return unsafe(html`
    <details class="pipelines-edit-op" data-pipelines-op="set-off-pipeline">
      <summary class="pipelines-edit-op-summary">Set off-pipeline stages</summary>
      <div class="pipelines-edit-op-body" data-pipelines-op-form="set-off-pipeline" data-pipeline-id="${row.id}">
        <div class="pipelines-form-grid">
          <label class="pipelines-field">
            <span class="pipelines-field-label">Off-pipeline stage names (comma-separated)</span>
            <input
              class="pipelines-input"
              type="text"
              data-pipelines-field="set-off-pipeline"
              value="${row.offPipelineStages.join(',')}"
              placeholder="Blocked,Cancelled"
              autocomplete="off"
              spellcheck="false"
            >
            <span class="pipelines-field-hint">Cancelled is the cancel verb's destination — most templates include it.</span>
          </label>
        </div>
        <div class="pipelines-form-preview">
          <span class="pipelines-form-preview-label">Command preview</span>
          <code class="pipelines-form-preview-cmd" data-pipelines-preview="set-off-pipeline" data-pipeline-id="${row.id}">/deskwork:pipeline update ${row.id} --set-off-pipeline &lt;comma-sep&gt;</code>
        </div>
        <div class="pipelines-form-actions">
          <button
            class="pipelines-btn pipelines-btn--primary"
            type="button"
            data-pipelines-copy-button="set-off-pipeline"
            data-pipeline-id="${row.id}"
          >Copy command</button>
        </div>
      </div>
    </details>`);
}

export function renderEditForm(row: PipelineRow): RawHtml {
  return unsafe(html`
    <section
      class="pipelines-edit-panel"
      id="pipelines-edit-panel-${row.id}"
      data-pipelines-edit-panel
      data-pipeline-id="${row.id}"
      aria-labelledby="pipelines-edit-heading-${row.id}"
    >
      <header class="pipelines-edit-head">
        <h3 class="pipelines-edit-heading" id="pipelines-edit-heading-${row.id}">
          Edit <code>${row.id}</code>
        </h3>
        <p class="pipelines-edit-desc">
          The five operations are <strong>mutually exclusive</strong> per
          <code>deskwork pipeline update</code>. Open one, copy its
          command, paste into Claude Code. The CLI runs one operation
          at a time.
        </p>
      </header>
      ${renderCustomizeNotice(row)}
      <div class="pipelines-edit-ops" data-pipelines-edit-ops>
        ${renderAddPanel(row)}
        ${renderRenamePanel(row)}
        ${renderRemovePanel(row)}
        ${renderSetLockedPanel(row)}
        ${renderSetOffPanel(row)}
      </div>
      <div class="pipelines-form-actions">
        <button
          class="pipelines-btn pipelines-btn--secondary"
          type="button"
          data-pipeline-edit-cancel
          data-pipeline-id="${row.id}"
        >Close</button>
      </div>
    </section>`);
}
