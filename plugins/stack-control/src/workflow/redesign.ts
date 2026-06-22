// Mid-stream re-design re-entry (022 US8 / T033, FR-032, research D10). A
// `* → designing` re-entry from a later phase does two things:
//   (a) opens a NEW revision of the design record (append-only; never overwrites);
//   (b) PRESERVES the existing spec dir + `spec:` pointer as a revision rather
//       than discarding it (only the `design:` pointer is re-set).
// 030 (FR-017) retired per-phase checkpoints, so the re-entry no longer stales
// downstream phase checkpoints (there are none); the next whole-feature govern
// re-establishes the convergence record.
// This is the thinnest area of the feature (spec FR-032); the semantics are
// pinned here and exercised test-first.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { LoadOptions } from '../document-model/document.js';
import { setField } from '../roadmap/mutations.js';
import { anchorWithin } from './anchor.js';

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
  /** Whether the node currently has a `spec:` pointer (preserved, not cleared). */
  readonly hasSpec: boolean;
  readonly opts: LoadOptions;
  readonly at: string;
}

function anchored(installationRoot: string, p: string): string {
  // F1 (governance HIGH): the design-record pointer must stay inside the installation.
  return anchorWithin(installationRoot, p);
}

/**
 * Perform the re-entry: re-set the `design:` pointer (preserving `spec:`) and open a
 * design-record revision. The roadmap write re-validates the whole graph (zero-write on
 * failure). 030 (FR-017): no per-phase checkpoints to stale — the next whole-feature
 * govern re-establishes the convergence record.
 */
export function reenterDesign(args: ReenterArgs): ReenterResult {
  // (b) Re-set ONLY the design pointer — `spec:` is untouched, so the spec dir is
  // preserved as a revision rather than discarded.
  setField(args.roadmapPath, args.item, 'design', args.designDoc, args.opts, true);

  // (a) Append-only design-record revision.
  const revision = appendDesignRevision(anchored(args.installationRoot, args.designDoc), args.at);

  return { revision, specPreserved: args.hasSpec, designDoc: args.designDoc };
}
