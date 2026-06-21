// 030 — derive the coupling-correct touched set from a round's fix commits
// (FR-012): the fixed files' own chunks PLUS any chunk a fixed file is coupled
// into; a fix-created new file is assigned to a chunk by coupling rather than
// dropped (FR-007). Drives the bounded re-audit loop. Phase 1 stub (T002);
// implemented in Phase 6 (T046).

import type { Chunk, TouchedSet } from './chunk-artifacts.js';
import type { CouplingGraph } from './cluster-payload/coupling-graph.js';

/** Inputs to touched-set computation for one re-audit round. */
export interface TouchedSetInput {
  readonly round: number;
  readonly chunks: readonly Chunk[];
  readonly coupling: CouplingGraph;
  readonly fixCommits: readonly string[];
  readonly changedFiles: readonly string[];
}

/** Derive the coupling-correct touched set of chunks to re-audit next round. */
export function computeTouchedSet(_input: TouchedSetInput): TouchedSet {
  throw new Error('not implemented (030 touched-set stub — Phase 6 T046)');
}
