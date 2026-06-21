// 030 cluster-payload — cheap non-audit-byte trim pre-pass (FR-006, R2). Drops
// lockfiles, generated/vendored output, whitespace-only hunks, and fixture
// bytes from a cluster's payload before measuring against the envelope, and
// records each dropped category + byte count. Phase 1 stub (T001); implemented
// in Phase 3 (T018).

import type { TrimRecord } from '../chunk-artifacts.js';

/** A chunk of diff content keyed by its file path (the unit the trim pre-pass operates on). */
export interface FileDiff {
  readonly path: string;
  readonly diffText: string;
}

/** The result of the trim pre-pass: the surviving (auditable) diffs + what was dropped. */
export interface TrimResult {
  readonly kept: readonly FileDiff[];
  readonly trimApplied: readonly TrimRecord[];
}

/** Drop non-audit bytes (lockfile/generated/vendored/whitespace/fixture), recording each category. */
export function trimNonAuditBytes(_files: readonly FileDiff[]): TrimResult {
  throw new Error('not implemented (030 non-audit-trim stub — Phase 3 T018)');
}
