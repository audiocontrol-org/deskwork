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

// --- validation helpers (no `as`, no `any`; type-predicate narrowing) ---

const TRIM_CATEGORIES: readonly TrimCategory[] = ['lockfile', 'generated', 'vendored', 'whitespace', 'fixture'];
const SEAM_KINDS: readonly SeamFinding['kind'][] = ['removed-export', 'renamed-export', 'changed-arity', 'changed-required-shape'];
const OUTCOMES: readonly WholeFeatureConvergenceRecord['outcome'][] = [
  'converged',
  'override-eligible',
  'round-cap-surfaced',
  'fix-failure-surfaced',
  'unresolvable-merge-surfaced',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureRecord(value: unknown, entity: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${entity}: expected an object`);
  return value;
}

function reqString(rec: Record<string, unknown>, field: string, entity: string): string {
  const v = rec[field];
  if (typeof v !== 'string') throw new Error(`${entity}: missing or invalid '${field}' (expected string)`);
  return v;
}

function reqNumber(rec: Record<string, unknown>, field: string, entity: string): number {
  const v = rec[field];
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`${entity}: missing or invalid '${field}' (expected number)`);
  return v;
}

function reqBoolean(rec: Record<string, unknown>, field: string, entity: string): boolean {
  const v = rec[field];
  if (typeof v !== 'boolean') throw new Error(`${entity}: missing or invalid '${field}' (expected boolean)`);
  return v;
}

function reqArray(rec: Record<string, unknown>, field: string, entity: string): readonly unknown[] {
  const v = rec[field];
  if (!Array.isArray(v)) throw new Error(`${entity}: missing or invalid '${field}' (expected array)`);
  return v;
}

function reqStringArray(rec: Record<string, unknown>, field: string, entity: string): string[] {
  return reqArray(rec, field, entity).map((x, i) => {
    if (typeof x !== 'string') throw new Error(`${entity}: '${field}[${i}]' must be a string`);
    return x;
  });
}

function reqEnum<T extends string>(rec: Record<string, unknown>, field: string, entity: string, allowed: readonly T[]): T {
  const v = reqString(rec, field, entity);
  const match = allowed.find((a) => a === v);
  if (match === undefined) throw new Error(`${entity}: '${field}' must be one of: ${allowed.join(', ')}`);
  return match;
}

function reqFinding(value: unknown, entity: string): Finding {
  const r = ensureRecord(value, entity);
  return { id: reqString(r, 'id', entity), title: reqString(r, 'title', entity), severity: reqString(r, 'severity', entity) };
}

/** Validate a parsed object against the Chunk schema, throwing on a missing/invalid field. */
export function validateChunk(value: unknown): Chunk {
  const r = ensureRecord(value, 'Chunk');
  return {
    id: reqString(r, 'id', 'Chunk'),
    files: reqStringArray(r, 'files', 'Chunk'),
    splitCluster: reqBoolean(r, 'splitCluster', 'Chunk'),
    renderedBytes: reqNumber(r, 'renderedBytes', 'Chunk'),
  };
}

/** Validate a ChunkManifest, throwing on a missing/invalid field. */
export function validateChunkManifest(value: unknown): ChunkManifest {
  const r = ensureRecord(value, 'ChunkManifest');
  const chunkId = reqString(r, 'chunkId', 'ChunkManifest');
  const otherChunks = reqArray(r, 'otherChunks', 'ChunkManifest').map((el, i) => {
    const e = ensureRecord(el, `ChunkManifest.otherChunks[${i}]`);
    return { id: reqString(e, 'id', `ChunkManifest.otherChunks[${i}]`), files: reqStringArray(e, 'files', `ChunkManifest.otherChunks[${i}]`) };
  });
  return { chunkId, otherChunks };
}

/** Validate a SplitClusterMarker, throwing on a missing/invalid field. */
export function validateSplitClusterMarker(value: unknown): SplitClusterMarker {
  const r = ensureRecord(value, 'SplitClusterMarker');
  const trimApplied = reqArray(r, 'trimApplied', 'SplitClusterMarker').map((el, i) => {
    const e = ensureRecord(el, `SplitClusterMarker.trimApplied[${i}]`);
    return { category: reqEnum(e, 'category', `SplitClusterMarker.trimApplied[${i}]`, TRIM_CATEGORIES), bytes: reqNumber(e, 'bytes', `SplitClusterMarker.trimApplied[${i}]`) };
  });
  return {
    clusterId: reqString(r, 'clusterId', 'SplitClusterMarker'),
    subChunkIds: reqStringArray(r, 'subChunkIds', 'SplitClusterMarker'),
    trimApplied,
    coverageCaveat: reqString(r, 'coverageCaveat', 'SplitClusterMarker'),
  };
}

/** Validate a TouchedSet, throwing on a missing/invalid field. */
export function validateTouchedSet(value: unknown): TouchedSet {
  const r = ensureRecord(value, 'TouchedSet');
  return {
    round: reqNumber(r, 'round', 'TouchedSet'),
    chunkIds: reqStringArray(r, 'chunkIds', 'TouchedSet'),
    sourceFixCommits: reqStringArray(r, 'sourceFixCommits', 'TouchedSet'),
    newFiles: reqStringArray(r, 'newFiles', 'TouchedSet'),
  };
}

/** Validate a SeamResult, throwing on a missing/invalid field. */
export function validateSeamResult(value: unknown): SeamResult {
  const r = ensureRecord(value, 'SeamResult');
  const boundaryPairs = reqArray(r, 'boundaryPairs', 'SeamResult').map((el, i) => {
    const e = ensureRecord(el, `SeamResult.boundaryPairs[${i}]`);
    return { a: reqString(e, 'a', `SeamResult.boundaryPairs[${i}]`), b: reqString(e, 'b', `SeamResult.boundaryPairs[${i}]`) };
  });
  const findings = reqArray(r, 'findings', 'SeamResult').map((el, i) => {
    const e = ensureRecord(el, `SeamResult.findings[${i}]`);
    return {
      kind: reqEnum(e, 'kind', `SeamResult.findings[${i}]`, SEAM_KINDS),
      symbol: reqString(e, 'symbol', `SeamResult.findings[${i}]`),
      consumedAcross: reqBoolean(e, 'consumedAcross', `SeamResult.findings[${i}]`),
      severity: reqString(e, 'severity', `SeamResult.findings[${i}]`),
    };
  });
  return { boundaryPairs, findings, suppressedCompatible: reqNumber(r, 'suppressedCompatible', 'SeamResult') };
}

/** Validate a WholeFeatureConvergenceRecord, throwing on a missing/invalid field. */
export function validateWholeFeatureConvergenceRecord(value: unknown): WholeFeatureConvergenceRecord {
  const r = ensureRecord(value, 'WholeFeatureConvergenceRecord');
  const version = reqNumber(r, 'version', 'WholeFeatureConvergenceRecord');
  if (version !== 1) throw new Error(`WholeFeatureConvergenceRecord: 'version' must be 1`);
  const mode = reqString(r, 'mode', 'WholeFeatureConvergenceRecord');
  if (mode !== 'impl') throw new Error(`WholeFeatureConvergenceRecord: 'mode' must be 'impl'`);
  return {
    version: 1,
    mode: 'impl',
    item: reqString(r, 'item', 'WholeFeatureConvergenceRecord'),
    governedShaBase: reqString(r, 'governedShaBase', 'WholeFeatureConvergenceRecord'),
    headSha: reqString(r, 'headSha', 'WholeFeatureConvergenceRecord'),
    chunkIds: reqStringArray(r, 'chunkIds', 'WholeFeatureConvergenceRecord'),
    rounds: reqNumber(r, 'rounds', 'WholeFeatureConvergenceRecord'),
    liftedFindings: reqArray(r, 'liftedFindings', 'WholeFeatureConvergenceRecord').map((f, i) => reqFinding(f, `WholeFeatureConvergenceRecord.liftedFindings[${i}]`)),
    closedInLoopFindings: reqArray(r, 'closedInLoopFindings', 'WholeFeatureConvergenceRecord').map((f, i) => reqFinding(f, `WholeFeatureConvergenceRecord.closedInLoopFindings[${i}]`)),
    seamResult: validateSeamResult(r['seamResult']),
    splitClusterRefs: reqStringArray(r, 'splitClusterRefs', 'WholeFeatureConvergenceRecord'),
    outcome: reqEnum(r, 'outcome', 'WholeFeatureConvergenceRecord', OUTCOMES),
    anchorRoot: reqString(r, 'anchorRoot', 'WholeFeatureConvergenceRecord'),
  };
}
