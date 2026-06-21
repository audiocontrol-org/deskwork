// 030 cluster-payload — build coupling edges over the governedSha..HEAD changed
// file set (FR-003). Universal baseline = directory-adjacency + diff
// cross-reference (language-agnostic); the TypeScript import graph is an
// additional precision signal added only when present, never required.
// Phase 1 stub (T001); implemented in Phase 3 (T016).

/** The provenance of a coupling edge (R1 signals). */
export type CouplingSignal = 'dir' | 'diff-xref' | 'ts-import';

/** A directed coupling edge between two changed files, with its signal provenance. */
export interface CouplingEdge {
  readonly from: string;
  readonly to: string;
  readonly signal: CouplingSignal;
}

/** The coupling graph over the changed-file set. */
export interface CouplingGraph {
  readonly files: readonly string[];
  readonly edges: readonly CouplingEdge[];
}

/** Inputs to coupling-graph construction: the changed files + optional precision signals. */
export interface CouplingInput {
  readonly changedFiles: readonly string[];
  /** Raw unified diff text, for the diff-cross-reference baseline signal. */
  readonly diffText?: string;
  /** Pre-resolved TS import edges, when the import-graph precision layer is available. */
  readonly tsImportEdges?: readonly CouplingEdge[];
}

/** Build the coupling graph (dir-adjacency + diff-xref baseline; capability-gated TS import layer). */
export function buildCouplingGraph(_input: CouplingInput): CouplingGraph {
  throw new Error('not implemented (030 coupling-graph stub — Phase 3 T016)');
}
