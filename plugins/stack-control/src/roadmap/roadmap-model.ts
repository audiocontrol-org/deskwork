// Roadmap semantic layer — typed graph over the document-model (006 T017,
// data-model.md). Composes the generic engine's `loadDocument` (which already
// extracts edges + enforces referential integrity and acyclicity at load) and
// projects each Unit into a typed WorkItem the graph/views/mutations operate on.

import { loadDocument, type LoadOptions } from '../document-model/document.js';
import { DocumentModelError, type GovernableDocument, type Unit } from '../document-model/types.js';

export const PHASES = ['design', 'plan', 'impl', 'multi'] as const;
export type Phase = (typeof PHASES)[number];

export const KINDS = ['feature', 'primitive', 'fix', 'gap'] as const;
export type Kind = (typeof KINDS)[number];

/** A typed projection of a roadmap Unit (data-model.md § WorkItem). */
export interface WorkItem {
  readonly identifier: string;
  readonly phase: Phase;
  readonly kind: Kind;
  readonly status: string;
  readonly dependsOn: readonly string[];
  readonly partOf: string | null;
  readonly deferredUntil: string | null;
  readonly spec: string | null;
  readonly ref: string | null;
  /** The item's shape prose (body, sans the heading and the field bullets). */
  readonly scope: string;
}

export interface RoadmapModel {
  readonly doc: GovernableDocument;
  readonly items: readonly WorkItem[];
  readonly byId: ReadonlyMap<string, WorkItem>;
}

function toPhase(identifier: string, segment: string): Phase {
  const p = PHASES.find((x) => x === segment);
  if (p === undefined) {
    throw new DocumentModelError(`roadmap item '${identifier}' has an unknown phase '${segment}'`);
  }
  return p;
}

function toKind(identifier: string, segment: string): Kind {
  const k = KINDS.find((x) => x === segment);
  if (k === undefined) {
    throw new DocumentModelError(`roadmap item '${identifier}' has an unknown kind '${segment}'`);
  }
  return k;
}

/** Targets of a single edge field on a Unit ([] when the field is absent). */
function edgeTargets(unit: Unit, field: string): readonly string[] {
  return unit.edges.find((e) => e.field === field)?.targets ?? [];
}

/** Strip a single layer of surrounding quotes from an external field value. */
function unquote(value: string): string {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2]! : value;
}

function firstOrNull(targets: readonly string[]): string | null {
  return targets.length > 0 ? targets[0]! : null;
}

const FIELD_BULLET = /^\s*[-*]\s+[A-Za-z][A-Za-z0-9-]*\s*:/;
/** The unit's reserved level-2 `## ` heading line (NOT `### ` sub-notes). */
const UNIT_HEADING = /^## /;
/** A fenced-code-block delimiter (``` ``` `` / `~~~`), matching edges.ts. */
const SCOPE_FENCE = /^\s*(```|~~~)/;

/**
 * Body prose, dropping ONLY the unit's reserved `## ` heading line and the real
 * `- field:` bullet lines. `### ` sub-notes are legitimate body sub-notes per
 * grammars/roadmap.peg and MUST survive into scope; a field-looking bullet
 * inside a fenced code block is ordinary example prose (NOT a real field), so it
 * survives too — kept coherent with extractEdges (AUDIT-20260608-12).
 */
function scopeOf(unit: Unit): string {
  let inFence = false;
  return unit.body
    .split('\n')
    .filter((line) => {
      if (SCOPE_FENCE.test(line)) {
        inFence = !inFence;
        return true;
      }
      if (inFence) return true;
      return !UNIT_HEADING.test(line) && !FIELD_BULLET.test(line);
    })
    .join('\n')
    .trim();
}

function toWorkItem(unit: Unit): WorkItem {
  // The heading-keyed roadmap grammar guarantees `<phase>:<kind>/<slug>`; split
  // and validate (fail loud rather than trusting the shape blindly).
  const colon = unit.identifier.indexOf(':');
  const slash = unit.identifier.indexOf('/');
  if (colon < 0 || slash < 0 || slash < colon) {
    throw new DocumentModelError(
      `roadmap item '${unit.identifier}' is not a '<phase>:<kind>/<slug>' identifier`,
    );
  }
  const phase = toPhase(unit.identifier, unit.identifier.slice(0, colon));
  const kind = toKind(unit.identifier, unit.identifier.slice(colon + 1, slash));
  const deferred = firstOrNull(edgeTargets(unit, 'deferred-until'));
  const spec = firstOrNull(edgeTargets(unit, 'spec'));
  const ref = firstOrNull(edgeTargets(unit, 'ref'));
  return {
    identifier: unit.identifier,
    phase,
    kind,
    status: unit.status,
    dependsOn: edgeTargets(unit, 'depends-on'),
    partOf: firstOrNull(edgeTargets(unit, 'part-of')),
    deferredUntil: deferred === null ? null : unquote(deferred),
    spec: spec === null ? null : unquote(spec),
    ref: ref === null ? null : unquote(ref),
    scope: scopeOf(unit),
  };
}

/** Load a roadmap document into a typed WorkItem graph (composes loadDocument). */
export function loadRoadmap(docPath: string, opts: LoadOptions): RoadmapModel {
  const { doc } = loadDocument(docPath, opts);
  const items = doc.units.map(toWorkItem);
  const byId = new Map(items.map((i) => [i.identifier, i]));
  return { doc, items, byId };
}
