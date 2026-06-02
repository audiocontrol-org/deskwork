/**
 * Archived-lanes section renderer for `/dev/lanes` (Phase 6 Task 6.3
 * step 6.3.4).
 *
 * Wraps `renderLaneTable` for the archived rows inside a
 * collapse-by-default `<details>` element. The chevron-toggle
 * vocabulary matches Phase 5's swimlane-collapse pattern (universal
 * chevron convention from DESIGN-STANDARDS): closed → click → open.
 *
 * Empty-state: when no archived lanes exist, the section renders as
 * a stub line ("No archived lanes") with no `<details>` chrome — a
 * collapse affordance for zero rows would be wrong (nothing to
 * collapse into).
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { LaneRow } from './data.ts';
import { renderLaneTable } from './table.ts';

interface ArchivedSectionInput {
  readonly rows: readonly LaneRow[];
  readonly availableTemplates: readonly string[];
}

export function renderArchivedSection(input: ArchivedSectionInput): RawHtml {
  if (input.rows.length === 0) {
    return unsafe(html`
      <section
        class="lanes-archived lanes-archived--empty"
        data-lanes-archived
        aria-labelledby="lanes-archived-heading"
      >
        <h2 class="lanes-archived-heading" id="lanes-archived-heading">
          Archived lanes
        </h2>
        <p class="lanes-archived-empty">No archived lanes.</p>
      </section>`);
  }

  const table = renderLaneTable({
    rows: input.rows,
    availableTemplates: input.availableTemplates,
    emptyMessage: 'No archived lanes.',
    tableLabel: 'Archived lanes',
    archivedTable: true,
  });

  return unsafe(html`
    <section
      class="lanes-archived"
      data-lanes-archived
      aria-labelledby="lanes-archived-heading"
    >
      <details class="lanes-archived-details" data-lanes-archived-details>
        <summary class="lanes-archived-summary">
          <span class="lanes-archived-chevron" aria-hidden="true">▸</span>
          <span class="lanes-archived-heading" id="lanes-archived-heading">
            Archived lanes
          </span>
          <span class="lanes-archived-count">${input.rows.length}</span>
        </summary>
        <div class="lanes-archived-body">
          ${table}
        </div>
      </details>
    </section>`);
}
