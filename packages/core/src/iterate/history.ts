/**
 * Read-only history view over the iteration journal (Phase 34a — T3).
 *
 * The version strip in the new entry-keyed longform review surface needs
 * a list of every iteration recorded for an entry, plus the ability to
 * fetch the markdown captured at any specific version.
 *
 * `iterateEntry` already records the full markdown into the journal as
 * an `iteration` event (see `iterate/iterate.ts:80`), so this module is
 * a pure projection — no extension to `iterateEntry` is needed.
 *
 * Lookup by `versionNumber` alone is the common case (95%+: a single
 * stage per entry per version). If the operator iterated through
 * multiple stages and lands on the same version number for two stages,
 * the optional `stage` argument disambiguates.
 */

import { readJournalEvents } from '../journal/read.ts';

/**
 * Per Phase 3 (graphical-entries) the `stage` field on journal events
 * is any non-empty string (lane-template-driven). The iteration
 * history surface reports whatever stage value the journal recorded;
 * Phase 4's lane-aware history filtering replaces the narrow `Stage`
 * type with a per-lane stage union.
 */
export interface IterationListing {
  readonly versionNumber: number;
  readonly timestamp: string;
  readonly stage: string;
}

export interface IterationContent extends IterationListing {
  readonly markdown: string;
}

/**
 * Every iteration recorded for `entryId`, ordered by timestamp ascending
 * (which equals the order events were appended). Empty array when there
 * are none — never throws, never returns null.
 */
export async function listEntryIterations(
  projectRoot: string,
  entryId: string,
): Promise<IterationListing[]> {
  const events = await readJournalEvents(projectRoot, { entryId });
  const out: IterationListing[] = [];
  for (const event of events) {
    if (event.kind === 'iteration') {
      out.push({
        versionNumber: event.version,
        timestamp: event.at,
        stage: event.stage,
      });
    }
  }
  return out;
}

/**
 * The full content of a specific iteration. Returns `null` when no
 * matching event exists — this is a lookup, not a contract violation.
 *
 * `stage` is optional; when omitted, the first iteration matching
 * `versionNumber` (in chronological order) is returned. Pass `stage` to
 * disambiguate when an entry has matching version numbers across more
 * than one stage.
 */
export async function getEntryIteration(
  projectRoot: string,
  entryId: string,
  versionNumber: number,
  stage?: string,
): Promise<IterationContent | null> {
  const events = await readJournalEvents(projectRoot, { entryId });
  for (const event of events) {
    if (event.kind !== 'iteration') continue;
    if (event.version !== versionNumber) continue;
    if (stage !== undefined && event.stage !== stage) continue;
    return {
      versionNumber: event.version,
      timestamp: event.at,
      stage: event.stage,
      markdown: event.markdown,
    };
  }
  return null;
}
