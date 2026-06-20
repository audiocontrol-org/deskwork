// Roadmap edge-mutation + marker engine (028 US2, FR-014/016/017; contract
// RM1/RM3). Every mutation computes a CANDIDATE document in memory, re-validates
// the WHOLE graph (identifier uniqueness, referential integrity, acyclicity, no
// duplicate edge) via commitCandidate, and only then writes — a validation
// failure leaves the on-disk document byte-for-byte unchanged (zero-write).
// Dry-run (apply=false) returns the candidate without writing. Split out of
// mutations.ts to keep both files under the size cap; it composes the same
// candidate→validate→write substrate and the shared edge-line helpers.

import { loadDocument, type LoadOptions } from '../document-model/document.js';
import {
  commitCandidate,
  findUnit,
  lineInUnit,
  type MutationResult,
} from '../document-model/mutations-core.js';
import { DocumentModelError, type GovernableDocument, type Unit } from '../document-model/types.js';
import {
  edgeTargets,
  reassemble,
  rewriteEdgeLine,
  unitBodyLines,
} from './mutations.js';

export type { MutationResult } from '../document-model/mutations-core.js';

const STATUS_LINE = /^\s*[-*]\s+status\s*:/i;

/** Find a roadmap item by identifier, failing loud when absent. */
function requireUnit(doc: GovernableDocument, identifier: string): Unit {
  const unit = findUnit(doc, identifier);
  if (unit === undefined) throw new DocumentModelError(`roadmap has no item '${identifier}'`);
  return unit;
}

/** The grammar's declared edge-field names whose `references` is `unit`. */
function unitRefFields(doc: GovernableDocument): readonly string[] {
  return doc.grammar.edgeFields.filter((f) => f.references === 'unit').map((f) => f.name);
}

/** Assert `field` is a declared unit-ref edge field on this grammar (else usage). */
function requireUnitRefField(doc: GovernableDocument, field: string): void {
  if (!unitRefFields(doc).includes(field)) {
    throw new DocumentModelError(
      `edge field '${field}' is not a declared unit-reference edge (one of: ${unitRefFields(doc).join(', ')})`,
    );
  }
}

/**
 * Replace (or insert) a unit's body lines for the unit named `identifier`,
 * leaving every other unit byte-for-byte unchanged, and return the reassembled
 * candidate document source. `transform` receives the unit's current body lines
 * and returns the new ones.
 */
function rewriteUnitBody(
  doc: GovernableDocument,
  identifier: string,
  transform: (body: readonly string[]) => readonly string[],
): string {
  const bodies = doc.units.map((unit) => {
    const body = unitBodyLines(doc, unit);
    return (unit.identifier === identifier ? [...transform(body)] : body).join('\n');
  });
  return reassemble(doc, bodies);
}

/** Insert a `- <field>: <value>` line after the status line (or the heading). */
function insertEdgeLine(body: readonly string[], field: string, value: string): string[] {
  const out = [...body];
  let statusIdx = -1;
  for (let i = 0; i < out.length; i++) {
    if (STATUS_LINE.test(out[i]!)) {
      statusIdx = i;
      break;
    }
  }
  const insertAt = statusIdx >= 0 ? statusIdx + 1 : 1;
  out.splice(insertAt, 0, `- ${field}: ${value}`);
  return out;
}

/**
 * Add a typed edge `<from> --field <field> --to <to>` (FR-014). Re-validates the
 * whole graph (no cycle, no dangling target). A duplicate target (the edge
 * already lists `<to>`) fails loud BEFORE any write — the graph re-validation
 * would not catch a duplicate target on one edge line, so this is the guard.
 */
export function addEdge(
  docPath: string,
  from: string,
  field: string,
  to: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  requireUnitRefField(doc, field);
  const unit = requireUnit(doc, from);
  if (edgeTargets(unit, field).includes(to)) {
    throw new DocumentModelError(
      `'${from}' already has a '${field}' edge to '${to}' (duplicate edge)`,
    );
  }
  const candidate = rewriteUnitBody(doc, from, (body) => {
    if (edgeTargets(unit, field).length > 0) {
      return rewriteEdgeLine(body, field, (targets) => [...targets, to]);
    }
    return insertEdgeLine(body, field, to);
  });
  return commitCandidate(docPath, candidate, opts, apply);
}

/**
 * Remove a typed edge target `<from> --field <field> --to <to>` (FR-014).
 * Refuses loud if `<from>` does not currently hold that edge (the on-disk doc is
 * the source of truth — never a silent no-op that masks an operator typo). When
 * the last target is removed the whole edge line is dropped.
 */
export function removeEdge(
  docPath: string,
  from: string,
  field: string,
  to: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  requireUnitRefField(doc, field);
  const unit = requireUnit(doc, from);
  if (!edgeTargets(unit, field).includes(to)) {
    throw new DocumentModelError(
      `'${from}' has no '${field}' edge to '${to}' (nothing to remove)`,
    );
  }
  const candidate = rewriteUnitBody(doc, from, (body) => {
    const rewritten = rewriteEdgeLine(body, field, (targets) => targets.filter((t) => t !== to));
    // Drop the edge line entirely when the last target is removed.
    const lineRe = new RegExp(`^\\s*[-*]\\s+${field}\\s*:\\s*$`, 'i');
    return rewritten.filter((line) => !lineRe.test(line));
  });
  return commitCandidate(docPath, candidate, opts, apply);
}

/**
 * Reparent a typed edge in ONE validated move (FR-014; TASK-137): remove
 * `<from> --field <field> --to <fromParent>` and add `--to <toParent>`. A
 * `<fromParent>` that does NOT currently hold the edge fails loud (exit-2 class).
 * The candidate is re-validated as a whole, so a reparent that would introduce a
 * cycle or a dangling `<toParent>` is zero-write.
 */
export function moveEdge(
  docPath: string,
  child: string,
  field: string,
  fromParent: string,
  toParent: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  requireUnitRefField(doc, field);
  const unit = requireUnit(doc, child);
  const current = edgeTargets(unit, field);
  if (!current.includes(fromParent)) {
    throw new DocumentModelError(
      `'${child}' has no '${field}' edge to '${fromParent}' — cannot move it (nothing to reparent)`,
    );
  }
  if (current.includes(toParent)) {
    throw new DocumentModelError(
      `'${child}' already has a '${field}' edge to '${toParent}' (duplicate edge)`,
    );
  }
  const candidate = rewriteUnitBody(doc, child, (body) =>
    rewriteEdgeLine(body, field, (targets) => targets.map((t) => (t === fromParent ? toParent : t))),
  );
  return commitCandidate(docPath, candidate, opts, apply);
}

/**
 * Rename a node and repoint EVERY dependent edge (FR-014): the `## <id>` heading
 * is rewritten and every unit-ref edge targeting the old id is repointed onto the
 * new id. Re-validates the whole graph; a rename to a duplicate id (or one that
 * closes a cycle) is zero-write. Equivalent to `reclassify` in mutations.ts; the
 * roadmap CLI surfaces it as `rename` per contract RM1.
 */
export function renameNode(
  docPath: string,
  fromId: string,
  toId: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  requireUnit(doc, fromId);
  const fields = unitRefFields(doc);
  const bodies = doc.units.map((unit) => {
    let body = unitBodyLines(doc, unit);
    if (unit.identifier === fromId) {
      body = body.map((line, i) => (i === 0 ? line.replace(/^(#+\s+).*$/, `$1${toId}`) : line));
    }
    for (const field of fields) {
      if (edgeTargets(unit, field).includes(fromId)) {
        body = rewriteEdgeLine(body, field, (targets) =>
          targets.map((t) => (t === fromId ? toId : t)),
        );
      }
    }
    return body.join('\n');
  });
  return commitCandidate(docPath, reassemble(doc, bodies), opts, apply);
}

/**
 * Edge-aware node removal (FR-014/017): remove `<id>` and its body. A node that
 * is STILL a target of any unit-ref edge (depends-on / part-of) REFUSES LOUD —
 * removing it would dangle that edge, which the engine would reject at re-validate
 * anyway, but we fail with a clear, edge-naming message BEFORE the candidate
 * (never a generic referential-integrity error from a downstream unit).
 */
export function removeNode(
  docPath: string,
  id: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  requireUnit(doc, id);
  const fields = unitRefFields(doc);
  for (const unit of doc.units) {
    if (unit.identifier === id) continue;
    for (const field of fields) {
      if (edgeTargets(unit, field).includes(id)) {
        throw new DocumentModelError(
          `cannot remove '${id}' — '${unit.identifier}' still references it via '${field}' ` +
            `(re-point or remove that edge first; refusing to dangle the reference)`,
        );
      }
    }
  }
  const bodies = doc.units
    .filter((unit) => unit.identifier !== id)
    .map((unit) => unitBodyLines(doc, unit).join('\n'));
  // Reassembling with the removed unit excluded; when it was the only unit the
  // grammar still loads an empty body (a valid empty roadmap).
  if (bodies.length === 0) {
    const firstStart = doc.units[0]!.span.startLine;
    const pre = doc.sourceLines.slice(0, firstStart - 1).join('\n');
    return commitCandidate(docPath, pre, opts, apply);
  }
  return commitCandidate(docPath, reassemble(doc, bodies), opts, apply);
}

/**
 * Write (or clear) a roadmap marker field on a node (FR-016; TASK-298) — the
 * sanctioned verb that records `design-approved` / `analyze-clean` WITHOUT a
 * forbidden ROADMAP.md hand-edit. `value=true` records the marker (presence ⇒
 * true per `markerTrue`); `value=false` (the `--clear` path) removes it. Unknown
 * node fails loud; the candidate is re-validated (zero-write on failure).
 */
export function setMarker(
  docPath: string,
  id: string,
  marker: string,
  value: boolean,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  const unit = requireUnit(doc, id);
  const markerRe = new RegExp(`^\\s*[-*]\\s+${marker}\\s*:`, 'i');
  const candidate = rewriteUnitBody(doc, id, (body) => {
    const hasLine = body.some((line) => markerRe.test(line));
    if (value) {
      // Recorded fact (presence ⇒ true). Idempotent: a present marker is rewritten.
      if (hasLine) return body.map((line) => (markerRe.test(line) ? `- ${marker}: yes` : line));
      return insertEdgeLine(body, marker, 'yes');
    }
    // Clear: drop the marker line (a no-op when absent).
    return body.filter((line) => !markerRe.test(line));
  });
  // `unit` is referenced so the requireUnit fail-loud is the only place a bad id
  // surfaces; the candidate then re-validates the graph.
  void unit;
  return commitCandidate(docPath, candidate, opts, apply);
}
