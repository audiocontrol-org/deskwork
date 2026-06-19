// `roadmap cluster` (027 US2, FR-007..015) — group N existing items under a
// created-or-reused parent, with an optional `--chain` dependency wiring, in ONE
// atomic build→revalidate→write. It composes the existing mutation primitives
// exported from `mutations.ts` (research Decision 2: NO new transactional helper)
// and commits the whole candidate through `commitCandidate`, so a graph-
// invalidating cluster (cycle / dangling / self-edge) is zero-write (R7/FR-013).
//
// The pre-write refusals (non-existent child, empty children, parent∈children, a
// `--chain` conflicting `depends-on`) fail loud BEFORE the commit so the operator
// gets a descriptive message; cycle/dangling/self are caught (also zero-write) by
// `commitCandidate`'s whole-graph revalidation — defense in depth, not a silent
// skip (Principle V).

import { loadDocument, type LoadOptions } from '../document-model/document.js';
import { commitCandidate, findUnit, type MutationResult } from '../document-model/mutations-core.js';
import { DocumentModelError, type GovernableDocument, type Unit } from '../document-model/types.js';
import {
  buildSection,
  edgeTargets,
  reassemble,
  rewriteEdgeLine,
  unitBodyLines,
} from './mutations.js';

/** Input to the `cluster` verb (data-model § ClusterRequest). */
export interface ClusterInput {
  /** The parent grouping id — created (`planned`) when absent, else reused. */
  readonly parentId: string;
  /** Existing child ids, ordered (the order drives `--chain`). */
  readonly children: readonly string[];
  /** Wire `depends-on` `a→b→c` over `children` in argument order. */
  readonly chain: boolean;
  /** Optional description for a NEWLY-created parent (bare when absent). */
  readonly summary?: string;
}

/** Add `target` to an existing edge target list, deduplicating an exact match. */
function withTarget(existing: readonly string[], target: string): string[] {
  return existing.includes(target) ? [...existing] : [...existing, target];
}

/**
 * Append (or set) `field: <target>` on a unit body. When the edge line already
 * exists its target list gains `target` (exact-duplicate is a no-op); otherwise a
 * new edge line is inserted directly after the heading (body line 0). This is the
 * multi-parent `part-of` append (FR-009) and the per-child `depends-on` wiring.
 */
function appendEdge(body: readonly string[], field: string, target: string): string[] {
  const fieldRe = new RegExp(`^\\s*[-*]\\s+${field}\\s*:`, 'i');
  if (body.some((line) => fieldRe.test(line))) {
    return rewriteEdgeLine(body, field, (targets) => withTarget(targets, target));
  }
  const out = [...body];
  out.splice(1, 0, `- ${field}: ${target}`);
  return out;
}

/**
 * The `--chain` predecessor for `child` (its argument-order neighbor), or null for
 * the first child. REFUSES (FR-014) when the child already carries a `depends-on`
 * whose targets do NOT already include the predecessor — a conflicting recorded
 * dependency the chain would silently overwrite. A child with no `depends-on`, or
 * one already depending on the predecessor, is fine (the latter a consistent no-op).
 */
function chainPredecessor(
  doc: GovernableDocument,
  children: readonly string[],
  index: number,
): string | null {
  if (index === 0) return null;
  const predecessor = children[index - 1]!;
  const childUnit = findUnit(doc, children[index]!);
  if (childUnit === undefined) return predecessor; // existence already validated
  const existing = edgeTargets(childUnit, 'depends-on');
  if (existing.length > 0 && !existing.includes(predecessor)) {
    throw new DocumentModelError(
      `cluster --chain: '${children[index]!}' already depends-on [${existing.join(', ')}], ` +
        `which conflicts with the chain predecessor '${predecessor}' — refusing to overwrite a recorded dependency`,
    );
  }
  return predecessor;
}

/** The parent unit body: the EXISTING one (reused, unchanged) or a fresh `planned` section. */
function parentBody(doc: GovernableDocument, input: ClusterInput): string[] | null {
  const existing = findUnit(doc, input.parentId);
  if (existing !== undefined) return null; // reuse: emit verbatim from the unit walk
  return buildSection({ identifier: input.parentId, status: 'planned', scope: input.summary });
}

/**
 * Cluster `children` under `parentId`. Builds ONE candidate document (parent
 * create-or-reuse + per-child `part-of` + optional `--chain` `depends-on`) and
 * commits it through the shared validate-then-write substrate. Dry-run
 * (`apply=false`) returns the candidate without writing.
 */
export function cluster(
  docPath: string,
  input: ClusterInput,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  if (input.children.length === 0) {
    throw new DocumentModelError('cluster requires at least one --children id');
  }
  if (input.children.includes(input.parentId)) {
    throw new DocumentModelError(
      `cluster: parent '${input.parentId}' cannot also be one of its own --children`,
    );
  }
  const { doc } = loadDocument(docPath, opts);
  for (const child of input.children) {
    if (findUnit(doc, child) === undefined) {
      throw new DocumentModelError(`cluster: no item '${child}' (every --children id must exist)`);
    }
  }
  // Resolve the chain predecessor per child BEFORE building, so a conflicting
  // `depends-on` (FR-014) fails loud with zero write.
  const predecessor = new Map<string, string>();
  if (input.chain) {
    input.children.forEach((child, i) => {
      const pred = chainPredecessor(doc, input.children, i);
      if (pred !== null) predecessor.set(child, pred);
    });
  }

  const childSet = new Set(input.children);
  const newParentSection = parentBody(doc, input);
  const bodies: string[] = [];
  for (const unit of doc.units) {
    let body = unitBodyLines(doc, unit);
    if (childSet.has(unit.identifier)) {
      body = applyChildEdges(body, unit, input.parentId, predecessor.get(unit.identifier));
    }
    bodies.push(body.join('\n'));
  }
  // A newly-created parent is appended after the last unit (the operator reorders
  // with `roadmap order`); a reused parent is already in the walk above.
  if (newParentSection !== null) bodies.push(newParentSection.join('\n'));

  return commitCandidate(docPath, reassemble(doc, bodies), opts, apply);
}

/** Apply the `part-of` grouping (always) and the `--chain` `depends-on` (when set). */
function applyChildEdges(
  body: readonly string[],
  unit: Unit,
  parentId: string,
  predecessor: string | undefined,
): string[] {
  let out = appendEdge(body, 'part-of', parentId);
  if (predecessor !== undefined) out = appendEdge(out, 'depends-on', predecessor);
  return out;
}
