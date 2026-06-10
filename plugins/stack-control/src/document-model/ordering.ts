// Declared-order comparison (FR-004): sort by the grammar's ordered enumeration
// over the order-key field, tie-broken by identifier (a stable, total secondary
// sort — never a positional encoding). Lexicographic is never assumed.

import { DocumentModelError, type GrammarSpec } from './types.js';

export interface Orderable {
  readonly orderValue: string;
  readonly identifier: string;
}

/** Rank of an order value in the declared relation; -1 when out of domain. */
export function orderRank(grammar: GrammarSpec, orderValue: string): number {
  return grammar.orderKey.relation.indexOf(orderValue);
}

/** Assert an order value is within the grammar's declared domain (FR-004). */
export function assertInDomain(grammar: GrammarSpec, item: Orderable): void {
  if (orderRank(grammar, item.orderValue) === -1) {
    throw new DocumentModelError(
      `Unit '${item.identifier}' has order-key value '${item.orderValue}' outside the declared relation [${grammar.orderKey.relation.join(', ')}] (FR-004)`,
    );
  }
}

/** Compare two items by the declared relation, then by identifier (FR-004). */
export function compareUnits(grammar: GrammarSpec, a: Orderable, b: Orderable): number {
  const ra = orderRank(grammar, a.orderValue);
  const rb = orderRank(grammar, b.orderValue);
  if (ra !== rb) return ra - rb;
  if (a.identifier < b.identifier) return -1;
  if (a.identifier > b.identifier) return 1;
  return 0;
}
