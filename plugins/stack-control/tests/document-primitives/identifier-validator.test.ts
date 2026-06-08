// T012 (RED-first) — identifier invariants (FR-005, AUDIT-30 narrowing).
// Uniqueness (case-sensitive) across document ∪ archive (archived ids come from
// the ledger only); the CLOSED non-ordinal denylist; no opaque token; the order
// key never references the identifier.

import { describe, it, expect } from 'vitest';
import {
  isOrdinalIdentifier,
  validateIdentifiers,
  assertOrderKeyNotIdentifier,
} from '../../src/document-model/identifier-validator.js';
import { DocumentModelError, type GrammarSpec, type Unit } from '../../src/document-model/types.js';

function unit(identifier: string): Unit {
  return { identifier, status: 'captured', orderValue: 'captured', span: { startLine: 1, endLine: 1 }, body: '' };
}

describe('non-ordinal denylist (closed v1 set, FR-005)', () => {
  it.each(['F3', 'phase-2', 'step-1', '#4', '2', '1. thing', '3) thing'])(
    'rejects positional/sequence index %s',
    (id) => {
      expect(isOrdinalIdentifier(id)).toBe(true);
    },
  );

  it.each([
    '3 ways to industrialize execution', // prose title that merely starts with a number
    '5 hard problems',
    'design/insight-capture',
    'My readable title',
    'F-stop photography', // not F<n>
    'phase-shift keying', // not phase-<n>
  ])('allows non-positional identifier %s', (id) => {
    expect(isOrdinalIdentifier(id)).toBe(false);
  });
});

describe('uniqueness across document ∪ archive (FR-005)', () => {
  it('rejects a duplicate among live Units', () => {
    expect(() => validateIdentifiers([unit('Alpha'), unit('Alpha')], [])).toThrow(DocumentModelError);
  });

  it('rejects a live identifier that collides with an archived (ledger) identifier', () => {
    expect(() => validateIdentifiers([unit('Alpha')], ['Alpha'])).toThrow(/uniqu/i);
  });

  it('uniqueness is case-sensitive — `Foo` and `foo` coexist', () => {
    expect(() => validateIdentifiers([unit('Foo'), unit('foo')], [])).not.toThrow();
  });

  it('passes a clean set', () => {
    expect(() => validateIdentifiers([unit('Alpha'), unit('Beta')], ['Gamma'])).not.toThrow();
  });

  it('an ordinal identifier in the live set fails loud naming it', () => {
    expect(() => validateIdentifiers([unit('F3')], [])).toThrow(/F3/);
  });
});

describe('order key never references the identifier (FR-004)', () => {
  const base: GrammarSpec = {
    id: 'g',
    source: 'builtin',
    pegText: 'x = .',
    unit: { kind: 'heading', level: 3 },
    statusVocabulary: ['captured'],
    terminalStatuses: [],
    orderKey: { field: 'status', relation: ['captured'] },
    identifierProduction: { kind: 'title' },
    reconciliationHook: null,
  };

  it('accepts an order key over a non-identifier field', () => {
    expect(() => assertOrderKeyNotIdentifier(base)).not.toThrow();
  });

  it('rejects an order key whose field is the identifier', () => {
    const g: GrammarSpec = { ...base, orderKey: { field: 'identifier', relation: ['a'] } };
    expect(() => assertOrderKeyNotIdentifier(g)).toThrow(DocumentModelError);
  });
});
