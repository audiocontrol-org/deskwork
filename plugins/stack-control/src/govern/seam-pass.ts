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

/**
 * Count required params (not optional `?`, not defaulted `=`). A function-typed
 * param (`cb: (e: number) => void`) carries an `=>` arrow whose `=` must NOT be
 * read as a default assignment — strip arrows before the default check, else a
 * required callback param is silently dropped from the arity (TASK-438).
 */
function countRequired(paramList: string): number {
  return splitTopLevelParams(paramList)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((p) => !p.replace(/=>/g, '').includes('=') && !p.split(':')[0]?.trim().endsWith('?')).length;
}

/**
 * Extract the brace-delimited body of an interface/type literal, starting at the
 * index of its opening `{`, by scanning to the MATCHING `}`. Returns the inner text
 * (without the outer braces), or null if unbalanced (header truncated mid-body).
 */
function extractBraceBody(body: string, openBraceIdx: number): string | null {
  let depth = 0;
  let start = -1;
  for (let i = openBraceIdx; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') {
      if (depth === 0 && start === -1) start = i + 1;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return start === -1 ? '' : body.slice(start, i);
    }
  }
  return null;
}

/** Split an interface/type body into member declarations on TOP-LEVEL `;` / `,` / newline. */
function splitTopLevelMembers(bodyText: string): string[] {
  const out: string[] = [];
  let dp = 0;
  let da = 0;
  let db = 0;
  let dk = 0;
  let cur = '';
  const flush = (): void => {
    if (cur.trim().length > 0) out.push(cur.trim());
    cur = '';
  };
  for (const ch of bodyText) {
    if ((ch === ';' || ch === ',' || ch === '\n') && dp === 0 && da === 0 && db === 0 && dk === 0) {
      flush();
      continue;
    }
    if (ch === '(') dp++;
    else if (ch === ')') {
      if (dp > 0) dp--;
    } else if (ch === '<') da++;
    else if (ch === '>') {
      if (da > 0) da--;
    } else if (ch === '{') db++;
    else if (ch === '}') {
      if (db > 0) db--;
    } else if (ch === '[') dk++;
    else if (ch === ']') {
      if (dk > 0) dk--;
    }
    cur += ch;
  }
  flush();
  return out;
}

/**
 * Names of the REQUIRED members of an interface/type body (skip optional `?:` members,
 * index/call signatures, and anything not led by a plain identifier — conservative,
 * so an unparseable member is never read as a new required field).
 */
function requiredFieldsOf(bodyText: string): string[] {
  const fields: string[] = [];
  for (const seg of splitTopLevelMembers(bodyText)) {
    const m = /^([A-Za-z0-9_$]+)(\??)/.exec(seg);
    if (!m || m[1] === undefined) continue;
    if (m[2] !== '?') fields.push(m[1]);
  }
  return fields;
}

/** An exported symbol's seam-relevant shape: a function arity, an interface/type's required fields, or other. */
type ExportSig =
  | { readonly kind: 'fn'; readonly required: number }
  | { readonly kind: 'shape'; readonly requiredFields: readonly string[] }
  | { readonly kind: 'other' };

/**
 * Parse exported symbols on `+` or `-` diff lines → name → seam signature. Function
 * and interface/type signatures may span MULTIPLE contiguous same-sign diff lines
 * (TASK-426/431): accumulate continuation lines until the param list / brace body
 * balances before measuring it.
 */
function parseExports(diffText: string, sign: '+' | '-'): Map<string, ExportSig> {
  const map = new Map<string, ExportSig>();
  const bodies: string[] = [];
  for (const line of diffText.split('\n')) {
    if (line.startsWith(sign)) bodies.push(line.slice(1));
  }
  for (let i = 0; i < bodies.length; i++) {
    const first = bodies[i];
    if (first === undefined) continue;
    const body = first.trim();

    const fn = FN_HEAD.exec(body);
    if (fn && fn[1] !== undefined) {
      const openParenIdx = (fn.index ?? 0) + fn[0].length - 1; // index of the `(`
      let joined = body;
      let paramList = extractParamList(joined, openParenIdx);
      let j = i;
      while (paramList === null && j + 1 < bodies.length) {
        const next = bodies[++j];
        if (next === undefined) break;
        joined += `\n${next}`;
        paramList = extractParamList(joined, openParenIdx);
      }
      if (paramList !== null) {
        map.set(fn[1], { kind: 'fn', required: countRequired(paramList) });
        i = j;
      }
      continue;
    }

    const decl = DECL.exec(body);
    if (!decl || decl[1] === undefined) continue;
    const keyword = /^export\s+(?:async\s+)?(const|let|var|class|interface|type|enum)\b/.exec(body)?.[1];
    if (keyword === 'interface' || keyword === 'type') {
      let joined = body;
      let braceIdx = joined.indexOf('{');
      let j = i;
      while (braceIdx === -1 && j + 1 < bodies.length) {
        const next = bodies[++j];
        if (next === undefined) break;
        joined += `\n${next}`;
        braceIdx = joined.indexOf('{');
      }
      if (braceIdx !== -1) {
        let shapeBody = extractBraceBody(joined, braceIdx);
        while (shapeBody === null && j + 1 < bodies.length) {
          const next = bodies[++j];
          if (next === undefined) break;
          joined += `\n${next}`;
          shapeBody = extractBraceBody(joined, braceIdx);
        }
        if (shapeBody !== null) {
          map.set(decl[1], { kind: 'shape', requiredFields: requiredFieldsOf(shapeBody) });
          i = j;
          continue;
        }
      }
      // No brace body (union/primitive type alias) — no required-shape semantics.
      map.set(decl[1], { kind: 'other' });
      i = j;
      continue;
    }
    map.set(decl[1], { kind: 'other' });
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
    const removed = new Map<string, ExportSig>();
    const added = new Map<string, ExportSig>();
    for (const f of c.files) {
      const d = input.fileDiffs.get(f) ?? '';
      for (const [n, r] of parseExports(d, '-')) removed.set(n, r);
      for (const [n, r] of parseExports(d, '+')) added.set(n, r);
    }
    const names = new Set([...removed.keys(), ...added.keys()]);
    for (const name of names) {
      const inRem = removed.has(name);
      const inAdd = added.has(name);
      const remSig = removed.get(name);
      const addSig = added.get(name);

      let kind: SeamFinding['kind'] | null = null;
      let compatibleChange = false;
      if (inRem && !inAdd) kind = 'removed-export';
      else if (inRem && inAdd && remSig !== undefined && addSig !== undefined) {
        if (remSig.kind === 'fn' && addSig.kind === 'fn') {
          if (addSig.required > remSig.required) kind = 'changed-arity';
          else compatibleChange = true; // arity unchanged or narrowed — source-compatible
        } else if (remSig.kind === 'shape' && addSig.kind === 'shape') {
          // A required field present in the new shape but NOT required in the old one
          // (brand-new, or optional→required) breaks a cross-boundary consumer.
          const wasRequired = new Set(remSig.requiredFields);
          if (addSig.requiredFields.some((field) => !wasRequired.has(field))) {
            kind = 'changed-required-shape';
          } else compatibleChange = true;
        } else {
          compatibleChange = true; // kind changed / not seam-relevant — stay conservative
        }
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
