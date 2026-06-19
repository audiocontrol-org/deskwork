// Roadmap mutations (006 US2/US3, R7). Every mutation computes a CANDIDATE
// document in memory, re-validates the whole graph (identifier uniqueness,
// referential integrity, acyclicity) via loadDocumentFromSource, and only then
// writes — a validation failure leaves the on-disk document byte-for-byte
// unchanged (FR-010 zero-write). Dry-run (apply=false) returns the candidate
// source without writing. MVP layer ships `add`; advance/decompose/reclassify/
// defer follow in US3 (this same file, under the cap).

import {
  loadDocument,
  type LoadOptions,
} from '../document-model/document.js';
import {
  commitCandidate,
  findUnit,
  lineInUnit,
  spliceWithBlankLines,
  type MutationResult,
} from '../document-model/mutations-core.js';
import {
  DocumentModelError,
  type GovernableDocument,
  type Unit,
} from '../document-model/types.js';
import { loadRoadmap } from './roadmap-model.js';

// Re-export the shared result type so callers (subcommands/roadmap.ts) keep
// importing it from here.
export type { MutationResult } from '../document-model/mutations-core.js';

const STATUS_LINE = /^\s*[-*]\s+status\s*:/i;
const DEFERRED_LINE = /^\s*[-*]\s+deferred-until\s*:/i;

/** Find a roadmap item by identifier, failing loud when absent. */
function requireUnit(doc: GovernableDocument, identifier: string): Unit {
  const unit = findUnit(doc, identifier);
  if (unit === undefined) throw new DocumentModelError(`roadmap has no item '${identifier}'`);
  return unit;
}

/** The verbatim source lines of a Unit (its `## head` through its last body line). */
export function unitBodyLines(doc: GovernableDocument, unit: Unit): string[] {
  return [...doc.sourceLines.slice(unit.span.startLine - 1, unit.span.endLine)];
}

/** Targets of a single edge field on a Unit ([] when absent). */
export function edgeTargets(unit: Unit, field: string): string[] {
  return [...(unit.edges.find((e) => e.field === field)?.targets ?? [])];
}

/** Rewrite a unit-ref edge line in a body, mapping its target list through `transform`. */
export function rewriteEdgeLine(
  bodyLines: readonly string[],
  field: string,
  transform: (targets: readonly string[]) => readonly string[],
): string[] {
  const re = new RegExp(`^(\\s*[-*]\\s+${field}\\s*:\\s*)(.*)$`, 'i');
  return bodyLines.map((line) => {
    const m = re.exec(line);
    if (m === null) return line;
    const targets = m[2]!
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return `${m[1]}${transform(targets).join(', ')}`;
  });
}

/** Reassemble a document from its preamble, an ordered list of unit bodies, postamble. */
export function reassemble(doc: GovernableDocument, unitBodies: readonly string[]): string {
  const firstStart = doc.units[0]!.span.startLine;
  const lastEnd = doc.units[doc.units.length - 1]!.span.endLine;
  const pre = doc.sourceLines.slice(0, firstStart - 1).join('\n');
  const post = doc.sourceLines.slice(lastEnd).join('\n');
  const parts: string[] = [];
  if (pre.length > 0) parts.push(pre);
  parts.push(unitBodies.join('\n\n'));
  if (post.length > 0) parts.push(post);
  return parts.join('\n');
}

const DEFAULT_STATUS = 'planned';

/** One-move emergent-capture input; kind+phase ride in the identifier (FR-011). */
export interface AddInput {
  readonly identifier: string;
  readonly status?: string;
  readonly scope?: string;
  readonly dependsOn?: readonly string[];
  /** Parent groupings — a unit may belong to MULTIPLE parents (027 FR-009). */
  readonly partOf?: readonly string[];
  readonly deferredUntil?: string;
  readonly spec?: string;
  readonly ref?: string;
}

export function buildSection(input: AddInput): string[] {
  const lines = [`## ${input.identifier}`, `- status: ${input.status ?? DEFAULT_STATUS}`];
  if (input.dependsOn !== undefined && input.dependsOn.length > 0) {
    lines.push(`- depends-on: ${input.dependsOn.join(', ')}`);
  }
  if (input.partOf !== undefined && input.partOf.length > 0) {
    lines.push(`- part-of: ${input.partOf.join(', ')}`);
  }
  if (input.deferredUntil !== undefined) lines.push(`- deferred-until: ${input.deferredUntil}`);
  if (input.spec !== undefined) lines.push(`- spec: ${input.spec}`);
  if (input.ref !== undefined) lines.push(`- ref: ${input.ref}`);
  if (input.scope !== undefined && input.scope.length > 0) lines.push(input.scope);
  return lines;
}

/** Insert a new item (one-move emergent capture). Re-validates whole graph (R7). */
export function add(
  docPath: string,
  input: AddInput,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  const status = input.status ?? DEFAULT_STATUS;
  if (!doc.grammar.statusVocabulary.includes(status)) {
    throw new DocumentModelError(
      `status '${status}' is not in the declared vocabulary [${doc.grammar.statusVocabulary.join(', ')}]`,
    );
  }
  const sourceLines = doc.sourceLines;
  // Append after the last unit (the operator reorders with curate); when the
  // roadmap is empty, append at end of document. spliceWithBlankLines keeps
  // repeated adds tidy (AUDIT-20260608-11).
  const insertAt =
    doc.units.length > 0 ? doc.units[doc.units.length - 1]!.span.endLine : sourceLines.length;
  const candidate = spliceWithBlankLines(
    sourceLines.slice(0, insertAt),
    buildSection(input),
    sourceLines.slice(insertAt),
  );
  return commitCandidate(docPath, candidate, opts, apply);
}

/**
 * Set (or update) a single body field on an item — the substrate for the
 * workflow `link-design` / `link-spec` governed verbs (022 FR-019). When the
 * field line already exists it is rewritten; otherwise it is inserted directly
 * after the status line (or the heading when there is none). Re-validates the
 * whole graph; an invalidating value is zero-write (R7).
 */
export function setField(
  docPath: string,
  identifier: string,
  field: string,
  value: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  const unit = requireUnit(doc, identifier);
  const lines = [...doc.sourceLines];
  const fieldRe = new RegExp(`^\\s*[-*]\\s+${field}\\s*:`, 'i');
  const idx = lineInUnit(lines, unit, fieldRe);
  if (idx >= 0) {
    lines[idx] = `- ${field}: ${value}`;
  } else {
    const statusIdx = lineInUnit(lines, unit, STATUS_LINE);
    const insertAfter = statusIdx >= 0 ? statusIdx : unit.span.startLine - 1;
    lines.splice(insertAfter + 1, 0, `- ${field}: ${value}`);
  }
  return commitCandidate(docPath, lines.join('\n'), opts, apply);
}

/** Change an item's status along the lifecycle (re-validates whole graph; R7). */
export function advance(
  docPath: string,
  identifier: string,
  toStatus: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  const unit = requireUnit(doc, identifier);
  if (!doc.grammar.statusVocabulary.includes(toStatus)) {
    throw new DocumentModelError(
      `status '${toStatus}' is not in the declared vocabulary [${doc.grammar.statusVocabulary.join(', ')}]`,
    );
  }
  const lines = [...doc.sourceLines];
  const idx = lineInUnit(lines, unit, STATUS_LINE);
  if (idx < 0) throw new DocumentModelError(`item '${identifier}' has no status line to advance`);
  lines[idx] = `- status: ${toStatus}`;
  return commitCandidate(docPath, lines.join('\n'), opts, apply);
}

/**
 * Split one item into N peers (FR-009). The parts inherit the original's
 * status + dependencies + grouping + deferral; every former dependent's `depends-on` is repointed
 * from the original onto all parts. Re-validates the whole graph; an invalidating
 * split (cycle / reused identifier) is zero-write (R7).
 */
export function decompose(
  docPath: string,
  identifier: string,
  into: readonly string[],
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  if (into.length === 0) {
    throw new DocumentModelError('decompose requires at least one --into target');
  }
  const { doc } = loadDocument(docPath, opts);
  const original = requireUnit(doc, identifier);
  const inheritedDeps = edgeTargets(original, 'depends-on');
  const inheritedPartOf = edgeTargets(original, 'part-of');
  // Read the original's descriptive + blocking-relevant fields via the typed
  // projection so every part inherits them (AUDIT-20260608-03): a decomposed
  // deferred item MUST stay deferred — dropping `deferred-until` would silently
  // un-defer the parts. `spec`/`ref`/scope ride along so parts aren't bare ids.
  const source = loadRoadmap(docPath, opts).byId.get(identifier);
  if (source === undefined) throw new DocumentModelError(`roadmap has no item '${identifier}'`);

  const partSections = into.map((id) =>
    buildSection({
      identifier: id,
      // Carry the original's status so a decomposed in-flight item yields
      // in-flight parts (and a shipped item stays shipped) — without this the
      // parts silently reset to `planned` (AUDIT-20260608-14).
      status: source.status,
      dependsOn: inheritedDeps.length > 0 ? inheritedDeps : undefined,
      partOf: inheritedPartOf.length > 0 ? inheritedPartOf : undefined,
      deferredUntil: source.deferredUntil ?? undefined,
      spec: source.spec ?? undefined,
      ref: source.ref ?? undefined,
      scope: source.scope.length > 0 ? source.scope : undefined,
    }).join('\n'),
  );

  // Repoint an edge that referenced the decomposed item onto ALL its parts,
  // de-duplicating: a unit already referencing one of `into` (e.g. grouped under
  // both the decomposed item AND one of its parts) must not gain a duplicate
  // target (AUDIT-BARRAGE-codex-02). Order-preserving dedup.
  const repoint = (targets: readonly string[]): readonly string[] => [
    ...new Set(targets.flatMap((t) => (t === identifier ? into : [t]))),
  ];

  const bodies: string[] = [];
  for (const unit of doc.units) {
    if (unit.identifier === identifier) {
      bodies.push(...partSections);
      continue;
    }
    let body = unitBodyLines(doc, unit);
    if (edgeTargets(unit, 'depends-on').includes(identifier)) {
      body = rewriteEdgeLine(body, 'depends-on', repoint);
    }
    if (edgeTargets(unit, 'part-of').includes(identifier)) {
      // part-of now supports multiple parents (027 FR-009): repoint a grouping
      // under the decomposed item onto ALL of its parts, faithfully preserving
      // the membership rather than collapsing to the first part.
      body = rewriteEdgeLine(body, 'part-of', repoint);
    }
    bodies.push(body.join('\n'));
  }
  return commitCandidate(docPath, reassemble(doc, bodies), opts, apply);
}

/**
 * Rename an identifier (a phase/kind reclassification) AND rewrite every
 * referencing unit-ref edge atomically (FR-001a). Re-validates the whole graph;
 * a rename that invalidates it (duplicate identifier / cycle) is zero-write (R7).
 */
export function reclassify(
  docPath: string,
  fromId: string,
  toId: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  requireUnit(doc, fromId); // fail loud if the source item does not exist
  const unitRefFields = doc.grammar.edgeFields
    .filter((f) => f.references === 'unit')
    .map((f) => f.name);

  const bodies = doc.units.map((unit) => {
    let body = unitBodyLines(doc, unit);
    if (unit.identifier === fromId) {
      // Rewrite the `## <id>` heading (body line 0), preserving the heading level.
      body = body.map((line, i) => (i === 0 ? line.replace(/^(#+\s+).*$/, `$1${toId}`) : line));
    }
    for (const field of unitRefFields) {
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

export interface DeferChange {
  readonly until?: string;
  readonly clear?: boolean;
}

/** Set or clear the prose `deferred-until` condition (FR-004; zero-write on failure). */
export function defer(
  docPath: string,
  identifier: string,
  change: DeferChange,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  const unit = requireUnit(doc, identifier);
  const lines = [...doc.sourceLines];
  const idx = lineInUnit(lines, unit, DEFERRED_LINE);

  if (change.clear === true) {
    if (idx >= 0) lines.splice(idx, 1); // clearing an unset condition is a no-op
  } else {
    const until = change.until;
    if (until === undefined || until.trim().length === 0) {
      throw new DocumentModelError('defer requires --until <condition> (or --clear)');
    }
    const newLine = `- deferred-until: ${until}`;
    if (idx >= 0) {
      lines[idx] = newLine;
    } else {
      const statusIdx = lineInUnit(lines, unit, STATUS_LINE);
      const insertAfter = statusIdx >= 0 ? statusIdx : unit.span.startLine - 1;
      lines.splice(insertAfter + 1, 0, newLine);
    }
  }
  return commitCandidate(docPath, lines.join('\n'), opts, apply);
}
