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

  for (const line of body.split('\n')) {
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
  const ids = units.map((u) => u.identifier);
  const inDegree = new Map<string, number>(ids.map((id) => [id, 0]));
  // Adjacency: dependency → dependent (so a dependency with no unmet deps of its
  // own starts at in-degree 0 and is emitted before anything that depends on it).
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const unit of units) {
    for (const edge of unit.edges) {
      if (edge.field !== edgeField) continue;
      for (const dep of edge.targets) {
        // Dangling targets are caught by assertReferentialIntegrity; guard here
        // so acyclicity over a sound graph is well-defined.
        if (!dependents.has(dep)) continue;
        dependents.get(dep)!.push(unit.identifier);
        inDegree.set(unit.identifier, inDegree.get(unit.identifier)! + 1);
      }
    }
  }

  const ready = ids.filter((id) => inDegree.get(id) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    const next: string[] = [];
    for (const d of dependents.get(id)!) {
      const deg = inDegree.get(d)! - 1;
      inDegree.set(d, deg);
      if (deg === 0) next.push(d);
    }
    if (next.length > 0) {
      ready.push(...next);
      ready.sort();
    }
  }

  if (order.length < ids.length) {
    const cyclic = ids.filter((id) => inDegree.get(id)! > 0).sort();
    throw new DocumentModelError(
      `edge '${edgeField}' graph has a cycle among: ${cyclic.join(', ')} (FR-006 acyclicity)`,
    );
  }
  return order;
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
