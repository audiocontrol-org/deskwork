/**
 * Page-level error banner for `/dev/lanes` (Task 0.41 — closes
 * AUDIT-20260530-66 / cross-model AUDIT-BARRAGE-claude-P6-2).
 *
 * Mirrors `pages/pipelines/error-banner.ts`. When one or more
 * enumerated lane configs failed to load, the page surfaces a
 * top-of-page banner naming the count and the affected ids. The
 * per-row error rows in the table carry the file paths and loader
 * messages; this banner is the operator's first signal that something
 * needs fixing before any other action makes sense.
 *
 * When no lanes failed to load the banner renders nothing — the
 * function returns an empty `RawHtml`.
 */

import { html, unsafe, type RawHtml } from '../html.ts';
import type { LaneErrorRow } from './data.ts';

export function renderLaneErrorBanner(
  malformed: readonly LaneErrorRow[],
): RawHtml {
  if (malformed.length === 0) return unsafe('');
  const noun = malformed.length === 1 ? 'lane' : 'lanes';
  const ids = malformed.map((e) => e.id).join(', ');
  return unsafe(html`
    <aside class="lanes-banner lanes-banner--errors" role="alert" data-lanes-error-banner>
      <strong>${malformed.length} ${noun} failed to load.</strong>
      <span>Affected ids: <code>${ids}</code>. Each row below shows the offending file path and the loader's diagnostic.</span>
    </aside>`);
}
