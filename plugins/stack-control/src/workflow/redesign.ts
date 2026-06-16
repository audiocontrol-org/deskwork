// Mid-stream re-design re-entry (022 US8 / T033, FR-032, research D10). A
// `* → designing` re-entry from a later phase does three things:
//   (a) opens a NEW revision of the design record (append-only; never overwrites);
//   (b) marks the affected downstream phase checkpoints STALE (reusing the 021
//       checkpoint machinery) so they re-derive on the next govern;
//   (c) PRESERVES the existing spec dir + `spec:` pointer as a revision rather
//       than discarding it (only the `design:` pointer is re-set).
// This is the thinnest area of the feature (spec FR-032); the semantics are
// pinned here and exercised test-first.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { LoadOptions } from '../document-model/document.js';
import { setField } from '../roadmap/mutations.js';
import {
  isCheckpointStale,
  listCheckpointPhaseIds,
  markCheckpointStale,
} from '../govern/checkpoint-state.js';

const REVISION_MARKER = /^##\s+Revision\s+\d+\b/gm;

/**
 * Append a new revision marker to the design record (append-only). The prior
 * content is preserved verbatim; a `## Revision <N> (re-entry)` section is added.
 * Returns the new revision number. A missing record is created at revision 1.
 */
export function appendDesignRevision(designRecordPath: string, at: string): number {
  const prior = existsSync(designRecordPath) ? readFileSync(designRecordPath, 'utf8') : '';
  const existing = prior.match(REVISION_MARKER)?.length ?? 0;
  const revision = existing + 1;
  const header = prior.length === 0 ? '# Design record\n' : '';
  const sep = prior.length > 0 && !prior.endsWith('\n') ? '\n' : '';
  const section = `${sep}\n## Revision ${revision} (re-entry) — ${at}\n\nRe-entered \`designing\` mid-stream; the prior revision is preserved above.\n`;
  writeFileSync(designRecordPath, `${header}${prior}${section}`, 'utf8');
  return revision;
}

export interface ReenterResult {
  readonly revision: number;
  /** Phase ids of the checkpoints marked stale by the re-entry. */
  readonly staledCheckpoints: readonly string[];
  /** True when the existing spec dir / `spec:` pointer was preserved (not discarded). */
  readonly specPreserved: boolean;
  readonly designDoc: string;
}

export interface ReenterArgs {
  readonly installationRoot: string;
  readonly roadmapPath: string;
  readonly item: string;
  /** The (new) design record pointer, install-relative or absolute. */
  readonly designDoc: string;
  /** The feature slug (spec-dir basename) whose checkpoints stale; null when no spec. */
  readonly featureSlug: string | null;
  /** Whether the node currently has a `spec:` pointer (preserved, not cleared). */
  readonly hasSpec: boolean;
  readonly opts: LoadOptions;
  readonly at: string;
}

function anchored(installationRoot: string, p: string): string {
  return isAbsolute(p) ? p : join(installationRoot, p);
}

/**
 * Perform the re-entry: re-set the `design:` pointer (preserving `spec:`), open a
 * design-record revision, and stale every downstream phase checkpoint of the
 * feature. The roadmap write re-validates the whole graph (zero-write on failure).
 */
export function reenterDesign(args: ReenterArgs): ReenterResult {
  // (c) Re-set ONLY the design pointer — `spec:` is untouched, so the spec dir is
  // preserved as a revision rather than discarded.
  setField(args.roadmapPath, args.item, 'design', args.designDoc, args.opts, true);

  // (a) Append-only design-record revision.
  const revision = appendDesignRevision(anchored(args.installationRoot, args.designDoc), args.at);

  // (b) Stale every existing downstream checkpoint (re-design invalidates them).
  const staled: string[] = [];
  if (args.featureSlug !== null) {
    for (const phaseId of listCheckpointPhaseIds(args.installationRoot, args.featureSlug)) {
      markCheckpointStale(args.installationRoot, args.featureSlug, phaseId, 'redesign re-entry', args.at);
      if (isCheckpointStale(args.installationRoot, args.featureSlug, phaseId)) staled.push(phaseId);
    }
  }

  return { revision, staledCheckpoints: staled, specPreserved: args.hasSpec, designDoc: args.designDoc };
}
