/**
 * Pipeline-table renderer for `/dev/pipelines` (Phase 6 Task 6.4).
 *
 * Renders one row per template: id, source (plugin-preset vs
 * project-override), linear-stage count, locked-stage count,
 * off-pipeline-stage count, referencing-lane count, plus per-row
 * View / Edit / Delete buttons.
 *
 * Per `.claude/rules/affordance-placement.md`, every per-row action
 * lives ON the row — the View toggle, the Edit toggle, and the
 * Delete copy button (or its disabled-with-explanation variant).
 *
 * Per THESIS Consequence 2 the page never mutates state on the
 * server. Each button is a clipboard payload — the client controller
 * (`pipelines-page.ts`) copies it on click.
 *
 * Gates rendered visibly so the operator sees them before clicking:
 *
 *   - **Delete on a plugin preset** — disabled, title reads
 *     "Cannot delete plugin preset; customize to project override
 *     first." The next-step suggestion names `/deskwork:customize`.
 *
 *   - **Delete on a template with referencing lanes** — disabled,
 *     title enumerates the dependent lane ids and suggests the
 *     `--reassign-lanes-to <other-id>` workflow. Mirrors Task 6.3's
 *     disabled-Purge pattern.
 *
 *   - **Edit on a plugin preset** — the toggle is still present (the
 *     operator can view the form) but the form-side notice surfaces
 *     a "Customize first" CTA pointing at `/deskwork:customize
 *     pipeline <id>`. The edit-form module owns that markup; this
 *     table just passes through the source.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type {
  PipelineRow,
  PipelineErrorRow,
  PipelineLoadErrorKind,
} from './data.ts';
import { renderViewPanel } from './view-panel.ts';
import { renderEditForm } from './edit-form.ts';

const COPY_BTN_VIEW_LABEL = 'View';
const COPY_BTN_EDIT_LABEL = 'Edit';
const COPY_BTN_DELETE_LABEL = 'Delete';

interface RenderPipelineTableInput {
  readonly rows: readonly PipelineRow[];
  readonly errors: readonly PipelineErrorRow[];
}

function renderHealthyRow(row: PipelineRow): RawHtml {
  const deleteButton = renderDeleteButton(row);
  const sourceBadge = renderSourceBadge(row.source);

  return unsafe(html`
    <tr class="pipelines-row" data-pipeline-row data-pipeline-id="${row.id}" data-pipeline-source="${row.source}">
      <td class="pipelines-cell pipelines-cell--id"><code>${row.id}</code></td>
      <td class="pipelines-cell pipelines-cell--source">${sourceBadge}</td>
      <td class="pipelines-cell pipelines-cell--linear-count">${row.linearStages.length}</td>
      <td class="pipelines-cell pipelines-cell--locked-count">${row.lockedStages.length}</td>
      <td class="pipelines-cell pipelines-cell--off-count">${row.offPipelineStages.length}</td>
      <td class="pipelines-cell pipelines-cell--lanes-count">${row.referencingLanes.length}</td>
      <td class="pipelines-cell pipelines-cell--actions">
        <button
          class="pipelines-btn pipelines-btn--view"
          type="button"
          data-pipeline-view-toggle
          data-pipeline-id="${row.id}"
          aria-expanded="false"
          aria-controls="pipelines-view-panel-${row.id}"
        >${COPY_BTN_VIEW_LABEL}</button>
        <button
          class="pipelines-btn pipelines-btn--edit"
          type="button"
          data-pipeline-edit-toggle
          data-pipeline-id="${row.id}"
          aria-expanded="false"
          aria-controls="pipelines-edit-panel-${row.id}"
        >${COPY_BTN_EDIT_LABEL}</button>
        ${deleteButton}
      </td>
    </tr>
    <tr class="pipelines-row pipelines-row--view-panel" data-pipeline-view-row data-pipeline-id="${row.id}" hidden>
      <td class="pipelines-cell" colspan="7">
        ${renderViewPanel(row)}
      </td>
    </tr>
    <tr class="pipelines-row pipelines-row--edit-panel" data-pipeline-edit-row data-pipeline-id="${row.id}" hidden>
      <td class="pipelines-cell" colspan="7">
        ${renderEditForm(row)}
      </td>
    </tr>`);
}

function renderSourceBadge(source: PipelineRow['source']): RawHtml {
  if (source === 'project-override') {
    return unsafe(html`
      <span class="pipelines-source pipelines-source--override" title="Project override at .deskwork/pipelines/&lt;id&gt;.json">
        override
      </span>`);
  }
  return unsafe(html`
    <span class="pipelines-source pipelines-source--preset" title="Plugin-shipped preset; customize to mutate">
      preset
    </span>`);
}

function renderDeleteButton(row: PipelineRow): RawHtml {
  // Three gates surface as visibly-disabled chrome so the operator
  // sees the obstruction before clicking. The CLI enforces the same
  // gates; these are the visual mirrors.
  if (row.source === 'plugin-preset') {
    return unsafe(html`
      <button
        class="pipelines-btn pipelines-btn--delete-disabled"
        type="button"
        disabled
        aria-disabled="true"
        title="Cannot delete a plugin preset. Customize to a project override first: /deskwork:customize pipeline ${row.id}"
      >${COPY_BTN_DELETE_LABEL}</button>`);
  }
  if (row.referencingLanes.length > 0) {
    const noun = row.referencingLanes.length === 1 ? 'lane' : 'lanes';
    const list = row.referencingLanes.join(', ');
    return unsafe(html`
      <div class="pipelines-delete-blocked" data-pipelines-delete-blocked>
        <button
          class="pipelines-btn pipelines-btn--delete-disabled"
          type="button"
          disabled
          aria-disabled="true"
          aria-describedby="pipelines-delete-deps-${row.id}"
          title="Cannot delete: ${row.referencingLanes.length} ${noun} reference this template (${list}). Reassign first via /deskwork:pipeline delete ${row.id} --reassign-lanes-to <other-id>."
        >${COPY_BTN_DELETE_LABEL} — ${row.referencingLanes.length} ${noun}</button>
        <p class="pipelines-delete-deps" id="pipelines-delete-deps-${row.id}" data-pipelines-delete-deps>
          Used by <code>${list}</code>. Reassign via
          <code>/deskwork:pipeline delete ${row.id} --reassign-lanes-to &lt;other-id&gt;</code>.
        </p>
      </div>`);
  }
  if (row.unreadableLaneCount > 0) {
    // Per AUDIT-20260530-67: an unreadable lane MIGHT reference this
    // template — we cannot prove otherwise without reading its JSON.
    // The safe posture is to disable Delete so the operator cannot
    // delete a template whose dependents we cannot enumerate. The
    // page-level banner names which lane files need fixing.
    const noun = row.unreadableLaneCount === 1 ? 'lane is' : 'lanes are';
    return unsafe(html`
      <div class="pipelines-delete-blocked" data-pipelines-delete-blocked data-pipelines-delete-unreadable>
        <button
          class="pipelines-btn pipelines-btn--delete-disabled"
          type="button"
          disabled
          aria-disabled="true"
          aria-describedby="pipelines-delete-unreadable-${row.id}"
          title="Cannot delete: ${row.unreadableLaneCount} ${noun} unreadable; cannot confirm whether they reference this pipeline. Fix the unreadable lane JSON first."
        >${COPY_BTN_DELETE_LABEL} — ${row.unreadableLaneCount} unreadable</button>
        <p class="pipelines-delete-deps" id="pipelines-delete-unreadable-${row.id}" data-pipelines-delete-unreadable-deps>
          ${row.unreadableLaneCount} ${noun} unreadable; cannot confirm whether they reference this pipeline. Fix the unreadable lane JSON before deleting.
        </p>
      </div>`);
  }
  return unsafe(html`
    <button
      class="pipelines-btn pipelines-btn--delete"
      type="button"
      data-pipeline-copy
      data-copy="/deskwork:pipeline delete ${row.id}"
      title="Copy /deskwork:pipeline delete ${row.id} to clipboard"
    >${COPY_BTN_DELETE_LABEL}</button>`);
}

function describeErrorKind(kind: PipelineLoadErrorKind): string {
  switch (kind) {
    case 'parse':
      return 'JSON parse error';
    case 'zod':
      return 'Schema validation failed';
    case 'id-mismatch':
      return 'id field disagrees with filename basename';
    case 'missing':
      return 'File not found';
    case 'unknown':
      return 'Load error';
  }
}

function renderErrorRow(row: PipelineErrorRow): RawHtml {
  const noun = row.referencingLanes.length === 1 ? 'lane' : 'lanes';
  const dependents =
    row.referencingLanes.length > 0
      ? html`<p class="pipelines-error-dependents">${row.referencingLanes.length} ${noun} reference this template: <code>${row.referencingLanes.join(', ')}</code></p>`
      : '';

  return unsafe(html`
    <tr class="pipelines-row pipelines-row--error" data-pipeline-row data-pipeline-id="${row.id}" data-pipeline-error>
      <td class="pipelines-cell pipelines-cell--id"><code>${row.id}</code></td>
      <td class="pipelines-cell pipelines-cell--source">
        <span class="pipelines-source pipelines-source--error" title="Template failed to load">error</span>
      </td>
      <td class="pipelines-cell" colspan="5">
        <div class="pipelines-error" data-pipeline-error-detail>
          <p class="pipelines-error-kind">${describeErrorKind(row.error.kind)}</p>
          <p class="pipelines-error-path">at <code>${row.error.path}</code></p>
          <pre class="pipelines-error-message">${row.error.message}</pre>
          ${unsafe(dependents)}
        </div>
      </td>
    </tr>`);
}

function renderHeadRow(): RawHtml {
  return unsafe(html`
    <tr>
      <th class="pipelines-th pipelines-th--id" scope="col">ID</th>
      <th class="pipelines-th pipelines-th--source" scope="col">Source</th>
      <th class="pipelines-th pipelines-th--linear-count" scope="col" title="Linear stage count">Stages</th>
      <th class="pipelines-th pipelines-th--locked-count" scope="col" title="Locked stage count">Locked</th>
      <th class="pipelines-th pipelines-th--off-count" scope="col" title="Off-pipeline stage count">Off-pipeline</th>
      <th class="pipelines-th pipelines-th--lanes-count" scope="col" title="Lanes referencing this template">Lanes</th>
      <th class="pipelines-th pipelines-th--actions" scope="col">Actions</th>
    </tr>`);
}

export function renderPipelineTable(input: RenderPipelineTableInput): RawHtml {
  if (input.rows.length === 0 && input.errors.length === 0) {
    return unsafe(html`
      <table class="pipelines-table" data-pipelines-table>
        <caption class="pipelines-table-caption">Pipeline templates</caption>
        <thead>${renderHeadRow()}</thead>
        <tbody>
          <tr class="pipelines-row pipelines-row--empty">
            <td class="pipelines-cell pipelines-cell--empty" colspan="7">
              No pipeline templates visible. Plugin presets should always
              appear here; if you see this, the @deskwork/core build is
              missing its preset JSON.
            </td>
          </tr>
        </tbody>
      </table>`);
  }

  return unsafe(html`
    <table class="pipelines-table" data-pipelines-table>
      <caption class="pipelines-table-caption">Pipeline templates</caption>
      <thead>${renderHeadRow()}</thead>
      <tbody>
        ${input.rows.map((row) => renderHealthyRow(row))}
        ${input.errors.map((row) => renderErrorRow(row))}
      </tbody>
    </table>`);
}
