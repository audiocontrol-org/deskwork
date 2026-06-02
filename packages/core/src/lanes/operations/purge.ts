/**
 * lane purge — delete a lane config JSON from disk.
 *
 * Phase 6 Task 6.1 (graphical-entries). Refused (loudly) when any
 * entry still references the lane. The operator must move every
 * dependent entry to another lane via `lane move <slug> --to <other>`
 * first.
 *
 * Per the project's "content-management databases preserve, they
 * don't delete" rule, purge is the rarely-used corner case for a
 * lane that was created in error or that's genuinely no longer
 * relevant and has no historical entries. The preferred disposition
 * for a lane with history is `lane archive`.
 *
 * The refusal lists the first `PURGE_DEPENDENTS_SAMPLE_LIMIT`
 * dependent entry slugs (with a `+N more` suffix when there are
 * additional dependents) so the operator can find them quickly.
 */

import { unlinkSync } from 'node:fs';
import { appendJournalEvent } from '../../journal/append.ts';
import { readAllSidecars } from '../../sidecar/read-all.ts';
import { laneConfigPath, loadLaneConfig } from '../loader.ts';

/**
 * Cap on the number of dependent slugs included verbatim in the
 * refusal error before falling back to `+N more`. Five keeps the
 * error message scannable while still giving the operator concrete
 * names to grep for.
 */
const PURGE_DEPENDENTS_SAMPLE_LIMIT = 5;

export interface PurgeLaneResult {
  readonly purgedPath: string;
}

export async function purgeLane(
  projectRoot: string,
  id: string,
): Promise<PurgeLaneResult> {
  // Loading the lane up front gives us a useful "lane not found"
  // error before we walk every sidecar.
  loadLaneConfig(id, projectRoot);

  const sidecars = await readAllSidecars(projectRoot);
  const dependents = sidecars
    .filter((entry) => entry.lane === id)
    .map((entry) => entry.slug);

  if (dependents.length > 0) {
    const sample = dependents.slice(0, PURGE_DEPENDENTS_SAMPLE_LIMIT);
    const remainder = dependents.length - sample.length;
    const suffix = remainder > 0 ? `, +${remainder} more` : '';
    throw new Error(
      `Cannot purge lane "${id}": ${dependents.length} `
      + `${dependents.length === 1 ? 'entry references' : 'entries reference'} `
      + `it (${sample.join(', ')}${suffix}). Move each entry to another lane `
      + `with "deskwork lane move <slug> --to <other>" before purging.`,
    );
  }

  const path = laneConfigPath(projectRoot, id);
  unlinkSync(path);

  await appendJournalEvent(projectRoot, {
    kind: 'lane-purge',
    at: new Date().toISOString(),
    laneId: id,
    details: { purgedPath: path },
  });

  return { purgedPath: path };
}
