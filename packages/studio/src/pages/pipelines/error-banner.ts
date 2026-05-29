/**
 * Page-level error banner for `/dev/pipelines` (Phase 6 Task 6.4
 * Phase 2 follow-up).
 *
 * When one or more enumerated templates failed to load, the page
 * surfaces a top-of-page banner naming the count and the affected
 * ids. The per-row error rows in the table carry the file paths and
 * loader messages; this banner is the operator's first signal that
 * something needs fixing before any other action makes sense.
 *
 * When no templates failed to load the banner renders nothing —
 * the function returns an empty `RawHtml`.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { PipelineErrorRow } from './data.ts';

export function renderErrorBanner(errors: readonly PipelineErrorRow[]): RawHtml {
  if (errors.length === 0) return unsafe('');
  const noun = errors.length === 1 ? 'template' : 'templates';
  const ids = errors.map((e) => e.id).join(', ');
  return unsafe(html`
    <aside class="pipelines-banner pipelines-banner--errors" role="alert" data-pipelines-error-banner>
      <strong>${errors.length} pipeline ${noun} failed to load.</strong>
      <span>Affected ids: <code>${ids}</code>. Each row below shows the offending file path and the loader's diagnostic.</span>
    </aside>`);
}
