// 030 chunked-end-govern — entity types + read/write/schema surface for the
// new on-disk governance artifacts (FR-021). Persisted artifacts are
// installation-anchored under `.stack-control/` with atomic temp+rename,
// matching `convergence-record.ts`. Phase 1 (T002) creates the typed stubs;
// Phase 2 (T005) implements the schema validators + IO; Phase 9 (T060) adds the
// doctor surface.
//
// Entities trace to specs/030-chunked-end-govern/data-model.md.

/** A single audited finding (minimal shape; reconciled with the lift surface in US6). */
export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
}

/** The non-audit trim categories the pre-pass may drop (FR-006). */
export type TrimCategory = 'lockfile' | 'generated' | 'vendored' | 'whitespace' | 'fixture';

/** A non-audit trim record entry: how many bytes of a category were dropped. */
export interface TrimRecord {
  readonly category: TrimCategory;
  readonly bytes: number;
}

/** An envelope-sized audit unit — a set of coupled (or sub-split) files. data-model § Chunk. */
export interface Chunk {
  readonly id: string;
  readonly files: readonly string[];
  readonly splitCluster: boolean;
  readonly renderedBytes: number;
}

/** Per-chunk context listing the OTHER chunks' file lists — "what this chunk cannot see". */
export interface ChunkManifest {
  readonly chunkId: string;
  readonly otherChunks: readonly { readonly id: string; readonly files: readonly string[] }[];
}

/** Records that an oversized cluster was sub-split, with the coverage caveat. data-model § SplitClusterMarker. */
export interface SplitClusterMarker {
  readonly clusterId: string;
  readonly subChunkIds: readonly string[];
  readonly trimApplied: readonly TrimRecord[];
  readonly coverageCaveat: string;
}

/** The chunks a fix round changed — drives bounded re-audit. data-model § TouchedSet. */
export interface TouchedSet {
  readonly round: number;
  readonly chunkIds: readonly string[];
  readonly sourceFixCommits: readonly string[];
  readonly newFiles: readonly string[];
}

/** A substantive cross-boundary contract break. data-model § SeamResult. */
export interface SeamFinding {
  readonly kind: 'removed-export' | 'renamed-export' | 'changed-arity' | 'changed-required-shape';
  readonly symbol: string;
  readonly consumedAcross: boolean;
  readonly severity: string;
}

/** The interface-level seam pass outcome. data-model § SeamResult. */
export interface SeamResult {
  readonly boundaryPairs: readonly { readonly a: string; readonly b: string }[];
  readonly findings: readonly SeamFinding[];
  readonly suppressedCompatible: number;
}

/** The single per-feature record the graduate gate evaluates. data-model § WholeFeatureConvergenceRecord. */
export interface WholeFeatureConvergenceRecord {
  readonly version: 1;
  readonly mode: 'impl';
  readonly item: string;
  readonly governedShaBase: string;
  readonly headSha: string;
  readonly chunkIds: readonly string[];
  readonly rounds: number;
  readonly liftedFindings: readonly Finding[];
  readonly closedInLoopFindings: readonly Finding[];
  readonly seamResult: SeamResult;
  readonly splitClusterRefs: readonly string[];
  readonly outcome:
    | 'converged'
    | 'override-eligible'
    | 'round-cap-surfaced'
    | 'fix-failure-surfaced'
    | 'unresolvable-merge-surfaced';
  readonly anchorRoot: string;
}

const NOT_IMPLEMENTED = 'not implemented (030 chunk-artifacts stub — Phase 2 T005)';

/** Validate a parsed object against the Chunk schema, throwing on a missing/invalid field. */
export function validateChunk(_value: unknown): Chunk {
  throw new Error(NOT_IMPLEMENTED);
}

/** Validate a SplitClusterMarker, throwing on a missing/invalid field. */
export function validateSplitClusterMarker(_value: unknown): SplitClusterMarker {
  throw new Error(NOT_IMPLEMENTED);
}

/** Validate a TouchedSet, throwing on a missing/invalid field. */
export function validateTouchedSet(_value: unknown): TouchedSet {
  throw new Error(NOT_IMPLEMENTED);
}

/** Validate a SeamResult, throwing on a missing/invalid field. */
export function validateSeamResult(_value: unknown): SeamResult {
  throw new Error(NOT_IMPLEMENTED);
}

/** Validate a WholeFeatureConvergenceRecord, throwing on a missing/invalid field. */
export function validateWholeFeatureConvergenceRecord(_value: unknown): WholeFeatureConvergenceRecord {
  throw new Error(NOT_IMPLEMENTED);
}
