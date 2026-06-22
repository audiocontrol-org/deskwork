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

// Match the exported-function header up to (and including) the opening `(` of its
// parameter list; the param list itself is scanned with balanced-delimiter awareness
// (below) so inner parens — a function-typed param like `cb: (e: number) => void` —
// don't truncate the scan the way a `([^)]*)` capture would.
const FN_HEAD = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/;
const DECL = /^export\s+(?:const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/;

/**
 * Extract the parameter-list text of a function signature, starting at the index of
 * its opening `(`, by scanning to the MATCHING `)`. Tracks nesting depth across
 * `()`, `<>` (generics), `{}` and `[]` (inline object/tuple types) so a `)` that
 * closes an inner group (e.g. a callback param's own parens) does not end the scan.
 * Returns the inner text (without the outer parens), or null if unbalanced.
 */
function extractParamList(body: string, openParenIdx: number): string | null {
  let depthParen = 0;
  let depthAngle = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let start = -1;
  for (let i = openParenIdx; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') {
      if (depthParen === 0 && start === -1) start = i + 1;
      depthParen++;
    } else if (ch === ')') {
      depthParen--;
      if (depthParen === 0 && depthAngle === 0 && depthBrace === 0 && depthBracket === 0) {
        return start === -1 ? '' : body.slice(start, i);
      }
    } else if (ch === '<') depthAngle++;
    else if (ch === '>') {
      if (depthAngle > 0) depthAngle--;
    } else if (ch === '{') depthBrace++;
    else if (ch === '}') {
      if (depthBrace > 0) depthBrace--;
    } else if (ch === '[') depthBracket++;
    else if (ch === ']') {
      if (depthBracket > 0) depthBracket--;
    }
  }
  return null; // unbalanced — header truncated mid-signature
}

/**
 * Split a parameter list on TOP-LEVEL commas only — commas nested inside
 * `()`/`<>`/`{}`/`[]` (function-typed, generic, object, or tuple param types) are
 * NOT separators.
 */
function splitTopLevelParams(paramList: string): string[] {
  const params: string[] = [];
  let depthParen = 0;
  let depthAngle = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let current = '';
  for (const ch of paramList) {
    if (
      ch === ',' &&
      depthParen === 0 &&
      depthAngle === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      params.push(current);
      current = '';
      continue;
    }
    if (ch === '(') depthParen++;
    else if (ch === ')') {
      if (depthParen > 0) depthParen--;
    } else if (ch === '<') depthAngle++;
    else if (ch === '>') {
      if (depthAngle > 0) depthAngle--;
    } else if (ch === '{') depthBrace++;
    else if (ch === '}') {
      if (depthBrace > 0) depthBrace--;
    } else if (ch === '[') depthBracket++;
    else if (ch === ']') {
      if (depthBracket > 0) depthBracket--;
    }
    current += ch;
  }
  params.push(current);
  return params;
}

/** Count required params (not optional `?`, not defaulted `=`). */
function countRequired(paramList: string): number {
  return splitTopLevelParams(paramList)
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
    const fn = FN_HEAD.exec(body);
    if (fn && fn[1] !== undefined) {
      const openParenIdx = (fn.index ?? 0) + fn[0].length - 1; // index of the `(`
      const paramList = extractParamList(body, openParenIdx);
      if (paramList !== null) {
        map.set(fn[1], countRequired(paramList));
        continue;
      }
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
  // The seam pass is the signatures-only backstop (`renderSeamPayload` is "small
  // by construction"), so it scans ALL of a chunk's files — INCLUDING any
  // coverage-only file whose full diff was withheld from the audit payload to fit
  // the envelope (FR-027). A withheld file's cross-boundary interface break must
  // still be caught here even though its diff body never rendered into a chunk.
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
