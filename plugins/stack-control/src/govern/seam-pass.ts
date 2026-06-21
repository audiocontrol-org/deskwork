// 030 — final interface-level seam pass over cross-chunk and split-cluster
// boundaries (signatures + changed-function headers), gated to substantive
// contract breaks only (FR-014, R7). A substantive break is cross-boundary
// breakage — a removed/renamed export, changed arity, or changed required shape
// consumed across a chunk boundary; compatible additions and internal-only
// changes are NOT flagged. The seam payload fits the envelope. Phase 1 stub
// (T002); implemented in Phase 5 (T041).

import type { Chunk, SeamResult, SplitClusterMarker } from './chunk-artifacts.js';

/** Inputs to the seam pass: the chunk set + split-cluster markers defining the boundaries. */
export interface SeamPassInput {
  readonly chunks: readonly Chunk[];
  readonly splitClusterMarkers: readonly SplitClusterMarker[];
  /** Rendered diff text per file, for signature/header extraction at the boundaries. */
  readonly fileDiffs: ReadonlyMap<string, string>;
}

/** Run the interface-level seam pass; emit substantive cross-boundary breaks only. */
export function runSeamPass(_input: SeamPassInput): SeamResult {
  throw new Error('not implemented (030 seam-pass stub — Phase 5 T041)');
}
