// Pure `closes:` set-mutation engine (031 US2, FR-008/FR-009). `closes` is a
// PROSE edge field (grammars/roadmap.peg `references: prose`) stored as ONE raw
// comma-joined target string ("a, b, c"); the unit-reference edge machinery
// (add-edge/remove-edge) correctly REFUSES it, so this is the sanctioned path to
// record resolved backlog ids without a hand-edit.
//
// The engine is pure (no write): it loads the doc it is handed, parses the node's
// existing `closes:` comma-list, applies set-UNION for `add` then set-DIFFERENCE
// for `remove` (trimmed, deduped, STABLE order: existing kept in place, new
// appended), and returns BOTH the before/after sets (for the dry-run render) and
// the rewritten document source (for apply). The verb does the read/write +
// re-validate-then-commit (mutations-core), exactly like the edge mutations.
//
// Reuses the FENCE-AWARE `rewriteEdgeLine` (mutations.ts): it parses a comma-list
// and re-joins canonically, which is precisely the prose-closes shape — a closes
// bullet inside a fenced code block is a documented example and stays untouched.
// Creating the line when absent / dropping it when empty mirrors the unit-edge
// add/remove helpers. Adding an id does NOT validate it against the backlog
// (the node may record an id before it exists; validation is at close time).

import { loadDocument, type LoadOptions } from '../document-model/document.js';
import { findUnit } from '../document-model/mutations-core.js';
import { DocumentModelError, type GovernableDocument, type Unit } from '../document-model/types.js';
import { fenceDelimiter } from '../document-model/chrome.js';
import { reassemble, rewriteEdgeLine, unitBodyLines } from './mutations.js';

const STATUS_LINE = /^\s*[-*]\s+status\s*:/i;
const CLOSES_FIELD = 'closes';

/** The add/remove id sets for a closes mutation. Both optional (at least one
 * must be present — the caller fails loud when neither is given). */
export interface ClosesChange {
  readonly add?: readonly string[];
  readonly remove?: readonly string[];
}

/** The computed mutation: the before/after canonical sets (for the dry-run
 * render) + the rewritten document source (for the apply write). `changed` is
 * false when the union/difference is a no-op (every add already present, every
 * remove already absent) — reported, not an error (FR-008 idempotency). */
export interface ClosesMutation {
  readonly before: readonly string[];
  readonly after: readonly string[];
  readonly changed: boolean;
  readonly text: string;
}

/** Find a roadmap unit by identifier, failing loud when absent. */
function requireUnit(doc: GovernableDocument, identifier: string): Unit {
  const unit = findUnit(doc, identifier);
  if (unit === undefined) throw new DocumentModelError(`roadmap has no item '${identifier}'`);
  return unit;
}

/** The node's current prose `closes:` ids (trimmed, non-empty), in document order. */
function currentCloses(unit: Unit): string[] {
  const raw = unit.edges.find((e) => e.field === CLOSES_FIELD)?.targets ?? [];
  // The prose edge stores a SINGLE raw value (the whole comma string); split it.
  return raw
    .join(', ')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Apply union(add) then difference(remove), order-stable + deduped. */
function applySetOps(before: readonly string[], change: ClosesChange): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string): void => {
    const t = id.trim();
    if (t.length === 0 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const id of before) push(id);
  for (const id of change.add ?? []) push(id);
  const removeSet = new Set((change.remove ?? []).map((s) => s.trim()).filter((s) => s.length > 0));
  return out.filter((id) => !removeSet.has(id));
}

/** Insert a `- closes: <value>` line after the status line (or the heading). */
function insertClosesLine(body: readonly string[], value: string): string[] {
  const out = [...body];
  let statusIdx = -1;
  for (let i = 0; i < out.length; i++) {
    if (STATUS_LINE.test(out[i]!)) {
      statusIdx = i;
      break;
    }
  }
  const insertAt = statusIdx >= 0 ? statusIdx + 1 : 1;
  out.splice(insertAt, 0, `- ${CLOSES_FIELD}: ${value}`);
  return out;
}

/**
 * Drop the REAL `- closes:` field bullet (used when the set becomes empty) —
 * FENCE-AWARE (AUDIT-20260623-05). A `- closes:` line inside a fenced code block
 * is a documented example, NOT the field; removing it would be silent content
 * corruption. Mirrors the fence model of `rewriteEdgeLine` / `scopeOf` (shared
 * `fenceDelimiter`: a closing fence is the same char with a run length >= the
 * opener), so the reader and both writers scope a node body identically.
 */
function dropClosesLine(body: readonly string[]): string[] {
  const lineRe = new RegExp(`^\\s*[-*]\\s+${CLOSES_FIELD}\\s*:`, 'i');
  let openFence: { readonly char: '`' | '~'; readonly length: number } | null = null;
  const out: string[] = [];
  for (const line of body) {
    const fence = fenceDelimiter(line);
    if (fence !== null) {
      if (openFence === null) openFence = fence;
      else if (fence.char === openFence.char && fence.length >= openFence.length && fence.closeable) openFence = null;
      out.push(line); // a fence delimiter line is kept verbatim
      continue;
    }
    if (openFence === null && lineRe.test(line)) continue; // the REAL field bullet → drop
    out.push(line); // inside a fence (documented example) OR not a closes line → keep
  }
  return out;
}

/**
 * Rewrite the node's body to carry `after` as its canonical `closes:` set.
 * - empty `after` → drop the line.
 * - existing line → rewrite via the fence-aware `rewriteEdgeLine` (re-joins
 *   the new set canonically; a fenced example bullet stays untouched).
 * - no existing line + non-empty `after` → insert after the status line.
 */
function rewriteBody(body: readonly string[], hasLine: boolean, after: readonly string[]): string[] {
  if (after.length === 0) return dropClosesLine(body);
  if (hasLine) return rewriteEdgeLine(body, CLOSES_FIELD, () => after);
  return insertClosesLine(body, after.join(', '));
}

/**
 * Compute the closes mutation for `identifier` (FR-008/FR-009). Pure — loads the
 * doc, computes the before/after canonical sets and the rewritten source; the
 * verb decides dry-run vs. apply (and re-validates + writes on apply).
 */
export function computeCloses(
  docPath: string,
  identifier: string,
  change: ClosesChange,
  opts: LoadOptions,
): ClosesMutation {
  const { doc } = loadDocument(docPath, opts);
  const unit = requireUnit(doc, identifier);
  const before = currentCloses(unit);
  const after = applySetOps(before, change);
  const changed = before.length !== after.length || before.some((id, i) => id !== after[i]);
  const hasLine = unit.edges.some((e) => e.field === CLOSES_FIELD);
  const bodies = doc.units.map((u) => {
    const body = unitBodyLines(doc, u);
    return (u.identifier === identifier ? rewriteBody(body, hasLine, after) : body).join('\n');
  });
  return { before, after, changed, text: reassemble(doc, bodies) };
}
