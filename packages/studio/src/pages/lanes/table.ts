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
import type { LaneRow } from './data.ts';
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
  const purgeButton =
    row.archived && row.entryCount === 0
      ? renderCopyButton({
          label: COPY_BTN_PURGE_LABEL,
          copy: `/deskwork:lane purge ${row.id}`,
          variant: 'purge',
        })
      : '';

  return unsafe(html`
    <tr class="lanes-row" data-lane-row data-lane-id="${row.id}"${unsafe(row.archived ? ' data-archived' : '')}>
      <td class="lanes-cell lanes-cell--handle">
        <span
          class="lanes-reorder-handle"
          aria-hidden="true"
          title="Reorder via the dashboard lane rail"
        >⋮⋮</span>
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
 * Render a lane table with caption + thead + tbody. Empty rows fall
 * back to the supplied empty-message inside a single colspan cell so
 * the table chrome is still visible (per DESIGN-STANDARDS structure-
 * over-scrolling — even an empty hierarchy node communicates the
 * shape of the page).
 */
export function renderLaneTable(input: RenderLaneTableInput): RawHtml {
  if (input.rows.length === 0) {
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
