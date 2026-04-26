/**
 * journal-mappers.ts — adapt DraftHistoryEntry variants to the shared
 * journal storage contract (one file per record, each with `id` +
 * `timestamp`).
 *
 * The history event union doesn't carry a uniform id/timestamp shape
 * (variants are discriminated by `kind`). To route each event into its
 * own journal file we wrap it in an envelope keyed by a deterministic id
 * synthesized from the event's payload. Readers unwrap the envelope
 * before returning DraftHistoryEntry[] to the rest of the codebase.
 */

import { normalizeTimestamp } from '../journal.ts';
import type { DraftHistoryEntry } from './types.ts';

/** Storage wrapper for history events. */
export interface JournaledHistoryEntry {
  id: string;
  timestamp: string;
  entry: DraftHistoryEntry;
}

/**
 * Synthesize a deterministic id for a history event. The same event maps
 * to the same filename every time, so re-emitting an equivalent event
 * overwrites in place rather than duplicating.
 *
 * Rules:
 *   - workflow-created: `created-<workflowId>` (one per workflow)
 *   - workflow-state:   `state-<workflowId>-<normalized-timestamp>`
 *   - version:          `version-<workflowId>-v<n>`
 *   - annotation:       the annotation's own id
 */
export function synthesizeHistoryId(entry: DraftHistoryEntry): string {
  switch (entry.kind) {
    case 'workflow-created':
      return `created-${entry.workflow.id}`;
    case 'workflow-state':
      return `state-${entry.workflowId}-${normalizeTimestamp(entry.at)}`;
    case 'version':
      return `version-${entry.workflowId}-v${entry.version.version}`;
    case 'annotation':
      return entry.annotation.id;
  }
}

/** Wrap a history event in its journal envelope. */
export function envelopeFor(entry: DraftHistoryEntry): JournaledHistoryEntry {
  return {
    id: synthesizeHistoryId(entry),
    timestamp: entry.at,
    entry,
  };
}

/** Unwrap an envelope back to the original history event. */
export function unwrap(env: JournaledHistoryEntry): DraftHistoryEntry {
  return env.entry;
}
