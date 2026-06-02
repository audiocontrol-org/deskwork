/**
 * Page-level banner for `/dev/pipelines` (Task 0.42 — closes
 * AUDIT-20260530-67 / cross-model AUDIT-BARRAGE-claude-P6-2).
 *
 * When the lane corpus contains one or more files that cannot be
 * read, parsed, or do not carry a string `pipelineTemplate` field,
 * the pipelines page renders this banner at the top to surface the
 * count + the safe-posture rationale.
 *
 * The banner mirrors `pages/pipelines/error-banner.ts` and
 * `pages/lanes/error-banner.ts`. When `unreadableLaneCount` is zero
 * the banner renders nothing (returns an empty `RawHtml`). Routes
 * still call the function unconditionally; the empty return is the
 * no-op path.
 *
 * The per-row Delete buttons are gated on the same signal (see
 * `pages/pipelines/table.ts`'s `renderDeleteButton`); this banner is
 * the operator's first signal at page-level — "you're about to see
 * disabled Delete buttons; here's why."
 */

import { html, unsafe, type RawHtml } from '../html.ts';

export function renderUnreadableLanesBanner(
  unreadableLaneCount: number,
): RawHtml {
  if (unreadableLaneCount <= 0) return unsafe('');
  const noun = unreadableLaneCount === 1 ? 'lane is' : 'lanes are';
  const isAre = unreadableLaneCount === 1 ? 'this lane' : 'these lanes';
  return unsafe(html`
    <aside class="pipelines-banner pipelines-banner--unreadable" role="alert" data-pipelines-unreadable-banner>
      <strong>${unreadableLaneCount} ${noun} unreadable.</strong>
      <span>Cannot confirm whether ${isAre} reference any pipeline template. Delete is disabled for every template until the unreadable lane JSON is fixed — open <code>/dev/lanes</code> for the per-lane diagnostic.</span>
    </aside>`);
}
