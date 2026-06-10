// T008 (RED-first, 006) — assertReferentialIntegrity fails loud naming
// field+source+missing target for a dangling references:'unit' edge; passes for
// sound docs; external/prose targets are never integrity-checked (FR-005).

import { describe, it, expect } from 'vitest';
import { assertReferentialIntegrity } from '../../src/document-model/edges.js';
import {
  DocumentModelError,
  type Edge,
  type EdgeFieldSpec,
  type GrammarSpec,
  type Unit,
} from '../../src/document-model/types.js';

const EDGE_FIELDS: readonly EdgeFieldSpec[] = [
  { name: 'depends-on', references: 'unit', acyclic: true, blocking: true },
  { name: 'part-of', references: 'unit', acyclic: true, blocking: false },
  { name: 'deferred-until', references: 'prose', acyclic: false, blocking: true },
  { name: 'spec', references: 'external', acyclic: false, blocking: false },
];

const GRAMMAR: GrammarSpec = {
  id: 'roadmap',
  source: 'builtin',
  pegText: 'x = .',
  unit: { kind: 'heading', level: 2 },
  statusVocabulary: ['planned', 'shipped'],
  terminalStatuses: ['shipped'],
  orderKey: { field: 'phase', relation: ['design', 'impl', 'multi'] },
  identifierProduction: { kind: 'slug' },
  reconciliationHook: null,
  edgeFields: EDGE_FIELDS,
};

function unit(identifier: string, edges: readonly Edge[] = []): Unit {
  const phase = identifier.split(':')[0]!;
  return {
    identifier,
    status: 'planned',
    orderValue: phase,
    span: { startLine: 1, endLine: 1 },
    body: '',
    edges,
  };
}

describe('assertReferentialIntegrity (T008)', () => {
  it('passes when every unit-ref target exists', () => {
    const units = [
      unit('design:feature/a'),
      unit('impl:feature/b', [{ field: 'depends-on', targets: ['design:feature/a'] }]),
    ];
    expect(() => assertReferentialIntegrity(units, GRAMMAR)).not.toThrow();
  });

  it('fails loud naming field + source + missing target on a dangling depends-on', () => {
    const units = [unit('impl:feature/b', [{ field: 'depends-on', targets: ['design:feature/ghost'] }])];
    expect(() => assertReferentialIntegrity(units, GRAMMAR)).toThrow(DocumentModelError);
    let msg = '';
    try {
      assertReferentialIntegrity(units, GRAMMAR);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toContain('depends-on');
    expect(msg).toContain('impl:feature/b');
    expect(msg).toContain('design:feature/ghost');
  });

  it('does NOT integrity-check prose / external targets', () => {
    const units = [
      unit('impl:feature/b', [
        { field: 'deferred-until', targets: ['after something'] },
        { field: 'spec', targets: ['specs/999-not-a-unit'] },
      ]),
    ];
    expect(() => assertReferentialIntegrity(units, GRAMMAR)).not.toThrow();
  });
});
