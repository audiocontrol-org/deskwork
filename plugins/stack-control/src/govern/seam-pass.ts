// 030 — final interface-level seam pass over cross-chunk and split-cluster
// boundaries (signatures + changed-function headers), gated to substantive
// contract breaks only (FR-014, R7). A substantive break is cross-boundary
// breakage — a removed/renamed export, a changed arity (a new REQUIRED param),
// or a changed required shape consumed across a chunk boundary; compatible
// additions (new optional param, new export) and internal-only changes are NOT
// flagged (SC-003 false-positive target = 0). Implemented in Phase 5 (T041).

import type { Chunk, SeamFinding, SeamResult, SplitClusterMarker } from './chunk-artifacts.js';

/** Inputs to the seam pass: the chunk set + split-cluster markers + per-file diffs. */
export interface SeamPassInput {
  readonly chunks: readonly Chunk[];
  readonly splitClusterMarkers: readonly SplitClusterMarker[];
  readonly fileDiffs: ReadonlyMap<string, string>;
}

const FN = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/;
const DECL = /^export\s+(?:const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/;

/** Count required params (not optional `?`, not defaulted `=`). */
function countRequired(paramList: string): number {
  return paramList
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((p) => !p.includes('=') && !p.split(':')[0]?.trim().endsWith('?')).length;
}

/** Parse exported symbols on `+` or `-` diff lines → name → required-param count (null for non-functions). */
function parseExports(diffText: string, sign: '+' | '-'): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const line of diffText.split('\n')) {
    if (!line.startsWith(sign)) continue;
    const body = line.slice(1).trim();
    const fn = FN.exec(body);
    if (fn && fn[1] !== undefined && fn[2] !== undefined) {
      map.set(fn[1], countRequired(fn[2]));
      continue;
    }
    const decl = DECL.exec(body);
    if (decl && decl[1] !== undefined) map.set(decl[1], null);
  }
  return map;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Is `name` referenced in any chunk other than `ownChunkId` (consumed across the boundary)? */
function consumedInOtherChunk(name: string, ownChunkId: string, chunkText: ReadonlyMap<string, string>): boolean {
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`);
  for (const [id, text] of chunkText) {
    if (id !== ownChunkId && re.test(text)) return true;
  }
  return false;
}

function boundaryPairs(chunks: readonly Chunk[]): { a: string; b: string }[] {
  const pairs: { a: string; b: string }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];
      if (a !== undefined && b !== undefined) pairs.push({ a: a.id, b: b.id });
    }
  }
  return pairs;
}

/** Run the interface-level seam pass; emit substantive cross-boundary breaks only. */
export function runSeamPass(input: SeamPassInput): SeamResult {
  const chunkText = new Map<string, string>();
  for (const c of input.chunks) chunkText.set(c.id, c.files.map((f) => input.fileDiffs.get(f) ?? '').join('\n'));

  const findings: SeamFinding[] = [];
  let suppressedCompatible = 0;

  for (const c of input.chunks) {
    const removed = new Map<string, number | null>();
    const added = new Map<string, number | null>();
    for (const f of c.files) {
      const d = input.fileDiffs.get(f) ?? '';
      for (const [n, r] of parseExports(d, '-')) removed.set(n, r);
      for (const [n, r] of parseExports(d, '+')) added.set(n, r);
    }
    const names = new Set([...removed.keys(), ...added.keys()]);
    for (const name of names) {
      const inRem = removed.has(name);
      const inAdd = added.has(name);
      const remReq = removed.get(name) ?? null;
      const addReq = added.get(name) ?? null;

      let kind: SeamFinding['kind'] | null = null;
      let compatibleChange = false;
      if (inRem && !inAdd) kind = 'removed-export';
      else if (inRem && inAdd) {
        if (remReq !== null && addReq !== null && addReq > remReq) kind = 'changed-arity';
        else compatibleChange = true; // signature touched but source-compatible
      }

      const consumed = consumedInOtherChunk(name, c.id, chunkText);
      if (kind !== null && consumed) findings.push({ kind, symbol: name, consumedAcross: true, severity: 'HIGH' });
      else if (compatibleChange && consumed) suppressedCompatible++;
    }
  }

  return { boundaryPairs: boundaryPairs(input.chunks), findings, suppressedCompatible };
}

/** Render the signatures-only seam payload (small by construction — fits the envelope). */
export function renderSeamPayload(input: SeamPassInput): string {
  const lines: string[] = ['## Seam pass — cross-chunk interface signatures (headers only)'];
  for (const c of input.chunks) {
    for (const f of c.files) {
      const d = input.fileDiffs.get(f) ?? '';
      for (const line of d.split('\n')) {
        if (/^[+-]\s*export\s/.test(line)) lines.push(`${c.id} ${f}: ${line.trim()}`);
      }
    }
  }
  return lines.join('\n');
}
