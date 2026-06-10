// T010 (RED-first, 006) — assertAcyclicAndOrder returns a topological order for
// a DAG (dependency before dependent) and fails loud naming the cycle for a
// cyclic edge-type (FR-006/FR-008, Kahn's — R3).

import { describe, it, expect } from 'vitest';
import { assertAcyclicAndOrder } from '../../src/document-model/edges.js';
import {
  DocumentModelError,
  type Edge,
  type EdgeFieldSpec,
  type GrammarSpec,
  type Unit,
} from '../../src/document-model/types.js';

const EDGE_FIELDS: readonly EdgeFieldSpec[] = [
  { name: 'depends-on', references: 'unit', acyclic: true, blocking: true },
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

function unit(identifier: string, dependsOn: readonly string[] = []): Unit {
  const edges: readonly Edge[] = dependsOn.length ? [{ field: 'depends-on', targets: dependsOn }] : [];
  return {
    identifier,
    status: 'planned',
    orderValue: identifier.split(':')[0]!,
    span: { startLine: 1, endLine: 1 },
    body: '',
    edges,
  };
}

describe('assertAcyclicAndOrder (T010)', () => {
  it('returns a topological order with each dependency before its dependent', () => {
    const units = [
      unit('impl:feature/c', ['impl:feature/b']),
      unit('design:feature/a'),
      unit('impl:feature/b', ['design:feature/a']),
    ];
    const order = assertAcyclicAndOrder(units, GRAMMAR, 'depends-on');
    expect(order.indexOf('design:feature/a')).toBeLessThan(order.indexOf('impl:feature/b'));
    expect(order.indexOf('impl:feature/b')).toBeLessThan(order.indexOf('impl:feature/c'));
    expect(order).toHaveLength(3);
  });

  it('fails loud naming the cycle for a cyclic edge-type', () => {
    const units = [
      unit('impl:feature/a', ['impl:feature/b']),
      unit('impl:feature/b', ['impl:feature/a']),
    ];
    expect(() => assertAcyclicAndOrder(units, GRAMMAR, 'depends-on')).toThrow(DocumentModelError);
    let msg = '';
    try {
      assertAcyclicAndOrder(units, GRAMMAR, 'depends-on');
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/cycle/i);
    expect(msg).toContain('impl:feature/a');
    expect(msg).toContain('impl:feature/b');
  });

  it('an empty graph yields an empty order', () => {
    expect(assertAcyclicAndOrder([], GRAMMAR, 'depends-on')).toEqual([]);
  });
});
