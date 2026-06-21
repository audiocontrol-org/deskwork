// Roadmap semantic layer — typed graph over the document-model (006 T017,
// data-model.md). Composes the generic engine's `loadDocument` (which already
// extracts edges + enforces referential integrity and acyclicity at load) and
// projects each Unit into a typed WorkItem the graph/views/mutations operate on.

import { loadDocument, type LoadOptions } from '../document-model/document.js';
import { DocumentModelError, type GovernableDocument, type Unit } from '../document-model/types.js';
import { fenceDelimiter } from '../document-model/chrome.js';

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
  /**
   * Parent groupings (`part-of` targets). A unit may belong to MULTIPLE parents
   * (027 FR-009 multi-parent clustering) — the grammar already emits an edge
   * LIST, so this is the full projection (empty `[]` when the unit has no
   * grouping). Readers that want "the first parent" take `partOf[0]`.
   */
  readonly partOf: readonly string[];
  readonly deferredUntil: string | null;
  readonly spec: string | null;
  readonly ref: string | null;
  /** The design-record pointer (022 FR-003); derivation keys `designing` on this. */
  readonly design: string | null;
  /** Recorded operator-approval marker (022 FR-009) — the `design-to-spec` judgment gate. */
  readonly designApproved: boolean;
  /** Recorded `speckit-analyze`-clean marker (022 FR-029) — the default `specifying → implementing` signal. */
  readonly analyzeClean: boolean;
  /** Backlog ids this item resolves; closed mechanically on terminal closure (023 FR-001). */
  readonly closes: readonly string[];
  /** The item's shape prose (body, sans the heading and the field bullets). */
  readonly scope: string;
}

/**
 * A marker field (`design-approved:` / `analyze-clean:`) is TRUE when present and
 * not an explicit negation. The spec chain / operator records the fact; the gate
 * checks it (022 D5/analyze-U1) — presence is the recorded fact.
 */
function markerTrue(value: string | null): boolean {
  return value !== null && !/^(false|no|0)$/i.test(value.trim());
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

/**
 * Body prose, dropping ONLY the unit's reserved `## ` heading line and the real
 * `- field:` bullet lines. `### ` sub-notes are legitimate body sub-notes per
 * grammars/roadmap.peg and MUST survive into scope; a field-looking bullet
 * inside a fenced code block is ordinary example prose (NOT a real field), so it
 * survives too — kept coherent with extractEdges (AUDIT-20260608-12). The fence
 * model is char + run-length, type-matched (shared `fenceDelimiter`) so a mixed-
 * delimiter or nested fence is scoped the SAME way `rewriteEdgeLine` treats it
 * (AUDIT-20260621-52) — no divergence between the reader and the rewriter.
 */
function scopeOf(unit: Unit): string {
  let openFence: { readonly char: '`' | '~'; readonly length: number } | null = null;
  return unit.body
    .split('\n')
    .filter((line) => {
      const fence = fenceDelimiter(line);
      if (fence !== null) {
        if (openFence === null) openFence = fence;
        else if (fence.char === openFence.char && fence.length >= openFence.length) openFence = null;
        return true; // a fence delimiter line is body prose, kept verbatim
      }
      if (openFence !== null) return true; // inside a fence → example prose, kept
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
  const design = firstOrNull(edgeTargets(unit, 'design'));
  const designApproved = firstOrNull(edgeTargets(unit, 'design-approved'));
  const analyzeClean = firstOrNull(edgeTargets(unit, 'analyze-clean'));
  // `closes` is a prose edge (single raw value) carrying a comma-list of backlog ids.
  const closesRaw = firstOrNull(edgeTargets(unit, 'closes'));
  const closes =
    closesRaw === null
      ? []
      : closesRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  return {
    identifier: unit.identifier,
    phase,
    kind,
    status: unit.status,
    dependsOn: edgeTargets(unit, 'depends-on'),
    partOf: edgeTargets(unit, 'part-of'),
    deferredUntil: deferred === null ? null : unquote(deferred),
    spec: spec === null ? null : unquote(spec),
    ref: ref === null ? null : unquote(ref),
    design: design === null ? null : unquote(design),
    designApproved: markerTrue(designApproved),
    analyzeClean: markerTrue(analyzeClean),
    closes,
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
