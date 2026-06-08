// Universal identifier invariants (FR-005): identity decoupled from position.
// Enforced as part of FR-003 well-formedness; fail-loud on violation.

import { DocumentModelError, type GrammarSpec, type Unit } from './types.js';

// The CLOSED v1 non-ordinal denylist — an identifier that IS a positional /
// sequence index (NOT merely one that begins with a digit). "Refinable" means
// future versions may ADD patterns; the v1 contract is exactly this set
// (FR-005, AUDIT-30).
const ORDINAL_PATTERNS: readonly RegExp[] = [
  /^F\d+$/, // F<n>
  /^phase-\d+$/, // phase-<n>
  /^step-\d+$/, // step-<n>
  /^#\d+$/, // #<n>
  /^\d+$/, // a bare integer that is the entire identifier
  /^\d+[.)](\s|$)/, // a leading enumeration marker: `1.` / `3)` (NOT `3.5x`)
];

/** True iff the identifier is a positional/sequence index (FR-005 denylist). */
export function isOrdinalIdentifier(id: string): boolean {
  return ORDINAL_PATTERNS.some((re) => re.test(id));
}

// A bare opaque token (e.g. a UUID) is not a human-readable name (FR-005).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertReadable(id: string): void {
  if (id.trim().length === 0) {
    throw new DocumentModelError('identifier invariant violation: empty identifier (FR-005 human-readable)');
  }
  if (UUID.test(id)) {
    throw new DocumentModelError(
      `identifier invariant violation: '${id}' is an opaque token, not a human-readable name (FR-005)`,
    );
  }
}

/**
 * Validate the FR-005 invariants across the live Units ∪ the archived
 * identifiers. `archivedIdentifiers` come SOLELY from the provenance ledger
 * (FR-006) — never from scanning the archive contents. Uniqueness is a
 * case-sensitive exact match. Throws on the first violation, naming it.
 */
export function validateIdentifiers(
  units: readonly Unit[],
  archivedIdentifiers: readonly string[],
): void {
  const seen = new Set<string>(archivedIdentifiers);
  for (const u of units) {
    assertReadable(u.identifier);
    if (isOrdinalIdentifier(u.identifier)) {
      throw new DocumentModelError(
        `identifier invariant violation: '${u.identifier}' is a positional/sequence index (FR-005 non-ordinal)`,
      );
    }
    if (seen.has(u.identifier)) {
      throw new DocumentModelError(
        `identifier invariant violation: '${u.identifier}' is not unique across the document ∪ its archive (FR-005)`,
      );
    }
    seen.add(u.identifier);
  }
}

/**
 * FR-004: the order key must never reference the identifier (ordering by
 * identity would re-couple identity to position). A grammar error otherwise.
 */
export function assertOrderKeyNotIdentifier(grammar: GrammarSpec): void {
  const field = grammar.orderKey.field;
  if (field === 'identifier' || field === 'id') {
    throw new DocumentModelError(
      `grammar ${grammar.id}: order key references the identifier ('${field}'); ordering must be over a non-identity field (FR-004)`,
    );
  }
}
