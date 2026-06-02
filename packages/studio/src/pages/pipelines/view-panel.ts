/**
 * Stage-flow visualization for `/dev/pipelines` (Phase 6 Task 6.4
 * step 6.4.2 — read-side).
 *
 * Renders a horizontal flow of pill-shaped stage chips for
 * `linearStages`, with `lockedStages` marked by a proof-blue lock
 * outline so they're visually distinct from the freely-iterable
 * stages. `offPipelineStages` render in a separate section below the
 * linear flow, with kraft chrome so they read as cul-de-sacs rather
 * than parts of the main spine.
 *
 * The visualization is READ-ONLY. The edit form (separate module)
 * surfaces the 5 mutation operations as their own slash-command
 * builders. This panel exists so the operator can see the current
 * shape before deciding what to change.
 *
 * Per `.claude/rules/design-standards.md`: the press-check vocabulary
 * already in editorial-review.css (proof-blue, kraft, ink, paper) is
 * the source for chip colors. The pipelines page does NOT introduce
 * any new color or shape language; it composes the existing tokens.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { PipelineRow } from './data.ts';

function renderLinearStage(
  stage: string,
  isLocked: boolean,
  isLast: boolean,
): RawHtml {
  const lockClass = isLocked ? ' pipelines-stage--locked' : '';
  const lockBadge = isLocked
    ? unsafe(html`<span class="pipelines-stage-badge" aria-label="locked stage">lock</span>`)
    : '';
  const arrow = isLast
    ? ''
    : unsafe(html`<span class="pipelines-stage-arrow" aria-hidden="true">→</span>`);
  return unsafe(html`
    <li class="pipelines-stage-item">
      <span class="pipelines-stage pipelines-stage--linear${unsafe(lockClass)}" data-pipeline-stage="${stage}">
        <span class="pipelines-stage-label">${stage}</span>
        ${lockBadge}
      </span>
      ${arrow}
    </li>`);
}

function renderOffPipelineStage(stage: string): RawHtml {
  return unsafe(html`
    <li class="pipelines-stage-item">
      <span class="pipelines-stage pipelines-stage--off" data-pipeline-stage="${stage}">
        <span class="pipelines-stage-label">${stage}</span>
      </span>
    </li>`);
}

export function renderViewPanel(row: PipelineRow): RawHtml {
  const lockedSet = new Set(row.lockedStages);
  const linearItems = row.linearStages.map((stage, idx) =>
    renderLinearStage(
      stage,
      lockedSet.has(stage),
      idx === row.linearStages.length - 1,
    ),
  );
  const offItems = row.offPipelineStages.map(renderOffPipelineStage);

  const offSection =
    row.offPipelineStages.length === 0
      ? ''
      : unsafe(html`
        <section class="pipelines-view-off" aria-labelledby="pipelines-view-off-heading-${row.id}">
          <h4 class="pipelines-view-subheading" id="pipelines-view-off-heading-${row.id}">Off-pipeline</h4>
          <ul class="pipelines-stage-list pipelines-stage-list--off">
            ${offItems}
          </ul>
        </section>`);

  return unsafe(html`
    <section
      class="pipelines-view-panel"
      id="pipelines-view-panel-${row.id}"
      data-pipelines-view-panel
      data-pipeline-id="${row.id}"
      aria-labelledby="pipelines-view-heading-${row.id}"
    >
      <header class="pipelines-view-head">
        <h3 class="pipelines-view-heading" id="pipelines-view-heading-${row.id}">
          <code>${row.id}</code>: ${row.name}
        </h3>
        <p class="pipelines-view-desc">${row.description}</p>
      </header>
      <section class="pipelines-view-linear" aria-labelledby="pipelines-view-linear-heading-${row.id}">
        <h4 class="pipelines-view-subheading" id="pipelines-view-linear-heading-${row.id}">Linear flow</h4>
        <ul class="pipelines-stage-list pipelines-stage-list--linear">
          ${linearItems}
        </ul>
      </section>
      ${offSection}
    </section>`);
}
