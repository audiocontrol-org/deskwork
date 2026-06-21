// 030 — derive the coupling-correct touched set from a round's fix commits
// (FR-012): the fixed files' own chunks PLUS any chunk a fixed file is coupled
// into; a fix-created new file is assigned to a chunk by coupling rather than
// dropped (FR-007). Drives the bounded re-audit loop. Implemented in Phase 6
// (T046).

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

/** Undirected coupling neighbours of a file. */
function neighbours(coupling: CouplingGraph, file: string): string[] {
  const out: string[] = [];
  for (const e of coupling.edges) {
    if (e.from === file) out.push(e.to);
    else if (e.to === file) out.push(e.from);
  }
  return out;
}

/** Derive the coupling-correct touched set of chunks to re-audit next round. */
export function computeTouchedSet(input: TouchedSetInput): TouchedSet {
  const fileToChunk = new Map<string, string>();
  for (const c of input.chunks) for (const f of c.files) fileToChunk.set(f, c.id);

  const chunkIds = new Set<string>();
  const newFiles: string[] = [];

  for (const file of input.changedFiles) {
    const own = fileToChunk.get(file);
    if (own !== undefined) chunkIds.add(own);
    else newFiles.push(file); // a fix-created file not yet in any chunk

    // Coupling-correct: every chunk a coupled neighbour lives in is also touched.
    for (const nb of neighbours(input.coupling, file)) {
      const nbChunk = fileToChunk.get(nb);
      if (nbChunk !== undefined) chunkIds.add(nbChunk);
    }
  }

  return {
    round: input.round,
    chunkIds: [...chunkIds].sort(),
    sourceFixCommits: [...input.fixCommits],
    newFiles: [...newFiles].sort(),
  };
}
