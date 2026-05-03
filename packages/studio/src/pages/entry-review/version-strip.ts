/**
 * Version strip for the entry-keyed press-check surface (Phase 34a — T6).
 *
 * Renders one chip per recorded iteration of this entry. Clicking a chip
 * navigates to `?v=<n>` against the current URL — the renderer then
 * shows the historical markdown captured in the journal at that version.
 *
 * Differs from the legacy workflow-keyed strip:
 *   - Source of truth is `listEntryIterations(projectRoot, entryId)`, not
 *     `readVersions(workflowId)`.
 *   - Iteration "version" numbers are per-stage, so a given entry can
 *     legitimately have v1 in Outlining and v1 in Drafting. The chip
 *     label includes the stage prefix when more than one stage is
 *     represented to avoid an ambiguous "v1 / v1" sequence.
 *   - The "current" chip is whichever iteration matches the entry's
 *     current stage + iteration count from the sidecar
 *     (`entry.iterationByStage[entry.currentStage]`).
 */

import type { IterationListing } from '@deskwork/core/iterate/history';
import type { Entry } from '@deskwork/core/schema/entry';
import { html, unsafe, type RawHtml } from '../html.ts';

interface VersionStripOptions {
  readonly iterations: readonly IterationListing[];
  readonly entry: Entry;
  /** When set, this version's chip is highlighted as active (historical view). */
  readonly historicalVersion: number | null;
}

function currentStageVersion(entry: Entry): number | null {
  const v = entry.iterationByStage[entry.currentStage];
  return typeof v === 'number' ? v : null;
}

function uniqueStages(iterations: readonly IterationListing[]): Set<string> {
  const out = new Set<string>();
  for (const it of iterations) out.add(it.stage);
  return out;
}

/**
 * Determine which iteration the on-disk artifact corresponds to. The
 * preferred signal is `entry.iterationByStage[entry.currentStage]` —
 * the sidecar's per-stage iteration counter. When the current stage
 * has no recorded iterations (typical for Final / Published entries
 * whose history was recorded under Drafting), fall back to the most
 * recent iteration overall — that's the closest match for "what's on
 * disk right now."
 */
function activeIteration(
  iterations: readonly IterationListing[],
  entry: Entry,
): IterationListing | null {
  if (iterations.length === 0) return null;
  const stageVersion = currentStageVersion(entry);
  if (stageVersion !== null) {
    const exact = iterations.find(
      (it) => it.stage === entry.currentStage && it.versionNumber === stageVersion,
    );
    if (exact !== undefined) return exact;
  }
  // Fall back to the latest iteration (iterations are time-ordered).
  return iterations[iterations.length - 1] ?? null;
}

export function renderVersionsStrip(opts: VersionStripOptions): RawHtml {
  const { iterations, entry, historicalVersion } = opts;
  if (iterations.length === 0) return unsafe('');

  const stagesSeen = uniqueStages(iterations);
  const showStage = stagesSeen.size > 1;
  const active = activeIteration(iterations, entry);

  const links = iterations.map((it) => {
    const isHistorical = historicalVersion !== null && it.versionNumber === historicalVersion;
    // When no historical version is requested, the active chip is the
    // iteration matching what's on disk (per `activeIteration`'s
    // fallback ladder). When historical IS requested, only that chip
    // is active.
    const isActive = isHistorical ||
      (historicalVersion === null && active !== null &&
        it.stage === active.stage && it.versionNumber === active.versionNumber);
    const label = showStage
      ? `${it.stage[0]}·v${it.versionNumber}`
      : `v${it.versionNumber}`;
    const href = `?v=${it.versionNumber}`;
    const cls = isActive ? 'active' : '';
    const title = `${it.stage} version ${it.versionNumber} (${it.timestamp})`;
    return html`<a href="${href}" class="${cls}" title="${title}">${label}</a>`;
  }).join('');

  return unsafe(html`<span class="er-strip-versions">${unsafe(links)}</span>`);
}
