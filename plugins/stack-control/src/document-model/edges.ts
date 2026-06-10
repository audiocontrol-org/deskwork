// Generic edge capability (006 R1/R2/R6, contracts/edge-engine-api.md).
//
// A grammar declares which body fields are edges/references (`edgeFields`). This
// module is the ONE auditable home for: extracting those fields from a Unit
// body (`extractEdges`), enforcing cross-Unit referential integrity
// (`assertReferentialIntegrity`, FR-005), and enforcing acyclicity + deriving a
// topological order (`assertAcyclicAndOrder`, FR-006/FR-008). It is generic —
// any heading-keyed grammar gets edges by declaring them; a grammar with no
// `edgeFields` parses exactly as before (backward-compatible with design-inbox).

import { DocumentModelError, type Edge, type GrammarSpec, type Unit } from './types.js';

/** Match a body bullet line `- <field>: <value>` (also `* <field>: …`). */
const BULLET_FIELD = /^\s*[-*]\s+([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/;

/** Match a fenced-code-block delimiter (``` ``` `` or `~~~`, any indent). */
const FENCE = /^\s*(```|~~~)/;

/**
 * Extract declared edge-fields from a Unit body. Pure; does NOT validate
 * cross-Unit references. Lines whose field is not a declared `edgeField` are
 * ignored. A declared field with an empty value is malformed and fails loud
 * (Constitution V — never a silent skip).
 */
export function extractEdges(body: string, grammar: GrammarSpec): readonly Edge[] {
  if (grammar.edgeFields.length === 0) return [];
  const declared = new Map(grammar.edgeFields.map((f) => [f.name, f]));
  // Accumulate targets per field so a field repeated across bullet lines merges.
  const byField = new Map<string, string[]>();
  const order: string[] = [];

  // Field-looking bullets inside a fenced code block (``` ``` `` / `~~~`) are
  // ordinary markdown example prose, NOT real edges (AUDIT-20260608-12). Track
  // fence state and skip those regions so a documented `- depends-on: …` example
  // never becomes a real reference (which would either break referential
  // integrity or silently alter readiness/order).
  let inFence = false;
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = BULLET_FIELD.exec(line);
    if (m === null) continue;
    const name = m[1]!;
    const spec = declared.get(name);
    if (spec === undefined) continue; // undeclared field — ignore
    const rawValue = m[2]!.trim();
    if (rawValue.length === 0) {
      throw new DocumentModelError(
        `edge field '${name}' has an empty value (omit the line rather than leaving it blank)`,
      );
    }
    const targets =
      spec.references === 'unit'
        ? rawValue
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [rawValue];
    if (targets.length === 0) {
      throw new DocumentModelError(`edge field '${name}' has no valid targets in '${rawValue}'`);
    }
    if (!byField.has(name)) order.push(name);
    const existing = byField.get(name);
    if (existing === undefined) byField.set(name, [...targets]);
    else existing.push(...targets);
  }

  return order.map((field) => ({ field, targets: byField.get(field)! }));
}

/** The set of `references:'unit'` edge-field names declared by the grammar. */
function unitRefFields(grammar: GrammarSpec): Set<string> {
  return new Set(grammar.edgeFields.filter((f) => f.references === 'unit').map((f) => f.name));
}

/**
 * Generic Kahn's topological sort (R3). The ONE auditable home for the graph
 * engine's topo pass so dependent layers (the roadmap `order` view) don't
 * re-hand-roll the in-degree loop. Each node's `depsOf(id)` lists the nodes that
 * must come BEFORE it (dependency → dependent emission). The in-degree-zero
 * frontier is ordered by `compare`, and on each step the globally smallest ready
 * node is emitted (the frontier is re-sorted as nodes become ready), so the
 * result is deterministic under `compare`.
 *
 * `onCycle` is called when the queue empties with nodes remaining; it receives
 * the still-unemitted node ids and MUST throw (fail loud — never a silent skip).
 * It returns `never` so the type system knows the loop cannot fall through.
 */
export function topoOrder(
  ids: readonly string[],
  depsOf: (id: string) => readonly string[],
  compare: (a: string, b: string) => number,
  onCycle: (remaining: readonly string[]) => never,
): string[] {
  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));
  // Adjacency: dependency → dependent (so a dependency with no unmet deps of its
  // own starts at in-degree 0 and is emitted before anything that depends on it).
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const id of ids) {
    for (const dep of depsOf(id)) {
      // Dangling targets are validated elsewhere (referential integrity); guard
      // here so the topo pass over a sound graph is well-defined.
      if (!dependents.has(dep)) continue;
      dependents.get(dep)!.push(id);
      inDegree.set(id, inDegree.get(id)! + 1);
    }
  }

  const frontier = ids.filter((id) => inDegree.get(id) === 0).sort(compare);
  const result: string[] = [];
  while (frontier.length > 0) {
    const id = frontier.shift()!;
    result.push(id);
    let added = false;
    for (const d of dependents.get(id)!) {
      const deg = inDegree.get(d)! - 1;
      inDegree.set(d, deg);
      if (deg === 0) {
        frontier.push(d);
        added = true;
      }
    }
    if (added) frontier.sort(compare);
  }

  if (result.length < ids.length) {
    const remaining = ids.filter((id) => inDegree.get(id)! > 0).sort();
    onCycle(remaining);
  }
  return result;
}

/**
 * Validate acyclicity over a single `references:'unit'` edge-type and return a
 * topological order (each dependency before its dependent) via Kahn's algorithm
 * (R3). A cycle (Kahn's queue empties with nodes remaining) fails loud naming
 * the items still in the cycle (FR-006). The frontier is processed in identifier
 * order for a deterministic result; the roadmap layer re-applies the declared
 * phase tiebreak for its `order` view.
 */
export function assertAcyclicAndOrder(
  units: readonly Unit[],
  _grammar: GrammarSpec,
  edgeField: string,
): readonly string[] {
  const deps = new Map<string, string[]>(units.map((u) => [u.identifier, []]));
  for (const unit of units) {
    for (const edge of unit.edges) {
      if (edge.field !== edgeField) continue;
      for (const dep of edge.targets) deps.get(unit.identifier)!.push(dep);
    }
  }
  const compareById = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return topoOrder(
    units.map((u) => u.identifier),
    (id) => deps.get(id) ?? [],
    compareById,
    (remaining) => {
      throw new DocumentModelError(
        `edge '${edgeField}' graph has a cycle among: ${remaining.join(', ')} (FR-006 acyclicity)`,
      );
    },
  );
}

/**
 * Validate referential integrity for `references:'unit'` fields against the
 * document's identifiers (FR-005). Throws a DocumentModelError naming the field,
 * the source item, and the missing target. `external`/`prose` targets are NOT
 * checked against Units.
 */
export function assertReferentialIntegrity(units: readonly Unit[], grammar: GrammarSpec): void {
  const unitFields = unitRefFields(grammar);
  if (unitFields.size === 0) return;
  const ids = new Set(units.map((u) => u.identifier));
  for (const unit of units) {
    for (const edge of unit.edges) {
      if (!unitFields.has(edge.field)) continue;
      for (const target of edge.targets) {
        if (!ids.has(target)) {
          throw new DocumentModelError(
            `edge '${edge.field}' on '${unit.identifier}' references '${target}', which is not an identifier of any item in the document (FR-005 referential integrity)`,
          );
        }
      }
    }
  }
}
