/**
 * Lane-table renderer for `/dev/lanes` (Phase 6 Task 6.3).
 *
 * Renders the active-lane table: one row per lane with id, name,
 * bound pipeline template, contentDir, entry count, plus per-row
 * Edit / Archive buttons and a reorder handle.
 *
 * Per `.claude/rules/affordance-placement.md`, the row's controls
 * live ON the row (component-attached, not toolbar-attached) —
 * each lane's Edit / Archive button addresses that one lane.
 *
 * Per THESIS Consequence 2, none of the buttons mutate state on
 * the server. Each carries the `data-copy` payload — the slash
 * command the operator would run — and the client-side
 * `lanes-page` controller wires the click handler to copy the
 * payload + flash a confirmation. The studio does not write to
 * any sidecar from this page.
 *
 * Reorder handle is a visual stub at this layer — Phase 5 Task 5.4
 * established the project-wide lane-order vocabulary as a
 * localStorage concern on the dashboard. This page's reorder
 * handle is visual-only; cross-page lane-order management belongs
 * on the dashboard rail.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { LaneRow, LaneErrorRow, LaneLoadErrorKind } from './data.ts';
import { renderEditForm } from './edit-form.ts';

const COPY_BTN_ARCHIVE_LABEL = 'Archive';
const COPY_BTN_RESTORE_LABEL = 'Restore';
const COPY_BTN_PURGE_LABEL = 'Purge';
const COPY_BTN_EDIT_LABEL = 'Edit';

interface RenderLaneTableInput {
  readonly rows: readonly LaneRow[];
  readonly availableTemplates: readonly string[];
  readonly emptyMessage: string;
  readonly tableLabel: string;
  /** When true, each row is rendered with a `data-archived` flag. */
  readonly archivedTable: boolean;
  /**
   * Per Task 0.41 (closes AUDIT-20260530-66): malformed lane configs
   * render as inline error rows so one corrupt JSON does not blind
   * the operator to the healthy lanes. Mirrors the pipelines page's
   * `PipelineErrorRow` channel. Only the active-table render passes
   * this; archived-table renders are healthy-only because the
   * archived/active routing already failed at load time.
   */
  readonly errors?: readonly LaneErrorRow[];
}

function renderTableRow(
  row: LaneRow,
  availableTemplates: readonly string[],
): RawHtml {
  const archiveOrRestore = row.archived
    ? renderCopyButton({
        label: COPY_BTN_RESTORE_LABEL,
        copy: `/deskwork:lane restore ${row.id}`,
        variant: 'restore',
      })
    : renderCopyButton({
        label: COPY_BTN_ARCHIVE_LABEL,
        copy: `/deskwork:lane archive ${row.id}`,
        variant: 'archive',
      });

  // Purge is gated to archived + zero-entry rows. The CLI enforces
  // the gate too; the page surfaces it visually to reduce the chance
  // the operator runs a refused command.
  //
  // When the lane is archived but still has entries, render a
  // visibly-disabled Purge button that names the gate ("N entries")
  // and explains the next step in its title. The disabled state
  // makes the gate discoverable — without it, the operator sees no
  // affordance at all and stalls.
  let purgeButton: RawHtml | '' = '';
  if (row.archived && row.entryCount === 0) {
    purgeButton = renderCopyButton({
      label: COPY_BTN_PURGE_LABEL,
      copy: `/deskwork:lane purge ${row.id}`,
      variant: 'purge',
    });
  } else if (row.archived && row.entryCount > 0) {
    purgeButton = renderDisabledPurgeButton(row.entryCount);
  }

  return unsafe(html`
    <tr class="lanes-row" data-lane-row data-lane-id="${row.id}"${unsafe(row.archived ? ' data-archived' : '')}>
      <td class="lanes-cell lanes-cell--handle">
        <span
          class="lanes-reorder-handle"
          aria-hidden="true"
          title="Reorder via the dashboard lane rail"
        >⋮</span>
      </td>
      <td class="lanes-cell lanes-cell--id"><code>${row.id}</code></td>
      <td class="lanes-cell lanes-cell--name">${row.name}</td>
      <td class="lanes-cell lanes-cell--template"><code>${row.pipelineTemplate}</code></td>
      <td class="lanes-cell lanes-cell--content-dir"><code>${row.contentDir}</code></td>
      <td class="lanes-cell lanes-cell--count">${row.entryCount}</td>
      <td class="lanes-cell lanes-cell--visibility">
        <span
          class="lanes-visibility-icon"
          aria-label="${row.archived ? 'Archived' : 'Visible'}"
          title="${row.archived ? 'Archived — hidden by default in the dashboard.' : 'Visible in the dashboard (operator may flip per-operator visibility client-side).'}"
        >${row.archived ? '◌' : '◉'}</span>
      </td>
      <td class="lanes-cell lanes-cell--actions">
        <button
          class="lanes-btn lanes-btn--edit"
          type="button"
          data-lane-edit-toggle
          data-lane-id="${row.id}"
          aria-expanded="false"
          aria-controls="lanes-edit-form-${row.id}"
        >${COPY_BTN_EDIT_LABEL}</button>
        ${archiveOrRestore}
        ${purgeButton}
      </td>
    </tr>
    <tr class="lanes-row lanes-row--edit-form" data-lane-edit-row data-lane-id="${row.id}" hidden>
      <td class="lanes-cell" colspan="8">
        ${renderEditForm(row, availableTemplates)}
      </td>
    </tr>`);
}

interface CopyButtonInput {
  readonly label: string;
  readonly copy: string;
  readonly variant: 'archive' | 'restore' | 'purge';
}

function renderCopyButton(input: CopyButtonInput): RawHtml {
  return unsafe(html`
    <button
      class="lanes-btn lanes-btn--${input.variant}"
      type="button"
      data-lane-copy
      data-copy="${input.copy}"
      title="Copy ${input.copy} to clipboard"
    >${input.label}</button>`);
}

/**
 * Render a visibly-disabled Purge button for an archived lane that
 * still has entries bound to it. The disabled state makes the gate
 * (move entries first) discoverable; the title explains the next
 * step. Carries no `data-copy` and no `data-lane-copy` — the client
 * controller never wires it for clipboard copy. The CLI also gates
 * purge on zero entries; this is the visual mirror of the CLI gate.
 */
function renderDisabledPurgeButton(entryCount: number): RawHtml {
  const noun = entryCount === 1 ? 'entry' : 'entries';
  return unsafe(html`
    <button
      class="lanes-btn lanes-btn--purge-disabled"
      type="button"
      disabled
      aria-disabled="true"
      title="Cannot purge: ${entryCount} ${noun} still reference this lane. Move them to another lane first via the per-entry surface."
    >${COPY_BTN_PURGE_LABEL} — ${entryCount} ${noun}</button>`);
}

function describeLaneErrorKind(kind: LaneLoadErrorKind): string {
  switch (kind) {
    case 'parse':
      return 'JSON parse error';
    case 'zod':
      return 'Schema validation failed';
    case 'id-mismatch':
      return 'id field disagrees with filename basename';
    case 'pipeline-resolve':
      return 'Referenced pipeline template failed to resolve';
    case 'missing':
      return 'File not found';
    case 'unknown':
      return 'Load error';
  }
}

/**
 * Render an inline error row for a malformed lane config. Mirrors
 * `renderErrorRow` in `pages/pipelines/table.ts`. The row spans the
 * action columns (it has no per-row affordances — there's nothing to
 * Edit / Archive / Restore / Purge on a lane that won't load) and
 * surfaces the loader's diagnostic + the offending path so the
 * operator can fix the JSON.
 */
function renderLaneErrorRow(row: LaneErrorRow): RawHtml {
  return unsafe(html`
    <tr class="lanes-row lanes-row--error" data-lane-row data-lane-id="${row.id}" data-lane-error>
      <td class="lanes-cell lanes-cell--handle">
        <span class="lanes-error-icon" aria-hidden="true" title="Lane failed to load">!</span>
      </td>
      <td class="lanes-cell lanes-cell--id"><code>${row.id}</code></td>
      <td class="lanes-cell" colspan="6">
        <div class="lanes-error" data-lane-error-detail>
          <p class="lanes-error-kind">${describeLaneErrorKind(row.error.kind)}</p>
          <p class="lanes-error-path">at <code>${row.error.path}</code></p>
          <pre class="lanes-error-message">${row.error.message}</pre>
        </div>
      </td>
    </tr>`);
}

/**
 * Render a lane table with caption + thead + tbody. Empty rows fall
 * back to the supplied empty-message inside a single colspan cell so
 * the table chrome is still visible (per DESIGN-STANDARDS structure-
 * over-scrolling — even an empty hierarchy node communicates the
 * shape of the page).
 *
 * Per Task 0.41 (closes AUDIT-20260530-66): when `input.errors` is
 * non-empty, error rows render alongside healthy rows so the
 * operator can see exactly which lane id failed and the loader's
 * diagnostic. The table is still rendered even when EVERY enumerated
 * lane is malformed (rows empty + errors non-empty); the empty
 * message renders only when both rows AND errors are empty.
 */
export function renderLaneTable(input: RenderLaneTableInput): RawHtml {
  const errors = input.errors ?? [];
  if (input.rows.length === 0 && errors.length === 0) {
    return unsafe(html`
      <table
        class="lanes-table${unsafe(input.archivedTable ? ' lanes-table--archived' : '')}"
        data-lanes-table${unsafe(input.archivedTable ? ' data-archived' : '')}
      >
        <caption class="lanes-table-caption">${input.tableLabel}</caption>
        <thead>${renderHeadRow()}</thead>
        <tbody>
          <tr class="lanes-row lanes-row--empty">
            <td class="lanes-cell lanes-cell--empty" colspan="8">${input.emptyMessage}</td>
          </tr>
        </tbody>
      </table>`);
  }
  return unsafe(html`
    <table
      class="lanes-table${unsafe(input.archivedTable ? ' lanes-table--archived' : '')}"
      data-lanes-table${unsafe(input.archivedTable ? ' data-archived' : '')}
    >
      <caption class="lanes-table-caption">${input.tableLabel}</caption>
      <thead>${renderHeadRow()}</thead>
      <tbody>
        ${input.rows.map((row) => renderTableRow(row, input.availableTemplates))}
        ${errors.map((row) => renderLaneErrorRow(row))}
      </tbody>
    </table>`);
}

function renderHeadRow(): RawHtml {
  return unsafe(html`
    <tr>
      <th class="lanes-th lanes-th--handle" scope="col" aria-label="Reorder handle"></th>
      <th class="lanes-th lanes-th--id" scope="col">ID</th>
      <th class="lanes-th lanes-th--name" scope="col">Name</th>
      <th class="lanes-th lanes-th--template" scope="col">Template</th>
      <th class="lanes-th lanes-th--content-dir" scope="col">Content dir</th>
      <th class="lanes-th lanes-th--count" scope="col">Entries</th>
      <th class="lanes-th lanes-th--visibility" scope="col">State</th>
      <th class="lanes-th lanes-th--actions" scope="col">Actions</th>
    </tr>`);
}
