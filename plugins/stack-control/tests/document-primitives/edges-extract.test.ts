// T006 (RED-first, 006) — extractEdges parses declared edge-field bullet lines
// from a Unit body, ignores undeclared fields, fails loud on malformed lines.

import { describe, it, expect } from 'vitest';
import { extractEdges } from '../../src/document-model/edges.js';
import { DocumentModelError, type EdgeFieldSpec, type GrammarSpec } from '../../src/document-model/types.js';

const EDGE_FIELDS: readonly EdgeFieldSpec[] = [
  { name: 'depends-on', references: 'unit', acyclic: true, blocking: true },
  { name: 'part-of', references: 'unit', acyclic: true, blocking: false },
  { name: 'deferred-until', references: 'prose', acyclic: false, blocking: true },
  { name: 'spec', references: 'external', acyclic: false, blocking: false },
];

function grammar(edgeFields: readonly EdgeFieldSpec[] = EDGE_FIELDS): GrammarSpec {
  return {
    id: 'roadmap',
    source: 'builtin',
    pegText: 'x = .',
    unit: { kind: 'heading', level: 2 },
    statusVocabulary: ['planned', 'shipped'],
    terminalStatuses: ['shipped'],
    orderKey: { field: 'phase', relation: ['design', 'impl'] },
    identifierProduction: { kind: 'slug' },
    reconciliationHook: null,
    edgeFields,
  };
}

describe('extractEdges (T006)', () => {
  it('parses a multi-target depends-on, a single part-of, prose and external fields', () => {
    const body = [
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a, multi:feature/b',
      '- part-of: design:feature/group',
      '- deferred-until: after the migration lands',
      '- spec: specs/002-parallel-execution-engine',
      'Some prose describing the item.',
    ].join('\n');
    const edges = extractEdges(body, grammar());
    expect(edges).toContainEqual({ field: 'depends-on', targets: ['design:feature/a', 'multi:feature/b'] });
    expect(edges).toContainEqual({ field: 'part-of', targets: ['design:feature/group'] });
    expect(edges).toContainEqual({ field: 'deferred-until', targets: ['after the migration lands'] });
    expect(edges).toContainEqual({ field: 'spec', targets: ['specs/002-parallel-execution-engine'] });
  });

  it('ignores undeclared fields (status, ref) and prose lines', () => {
    const body = ['## impl:feature/x', '- status: planned', '- ref: "#123"', 'prose: not a field'].join('\n');
    const edges = extractEdges(body, grammar());
    expect(edges).toEqual([]);
  });

  it('returns [] when the grammar declares no edge fields', () => {
    const body = '## impl:feature/x\n- depends-on: design:feature/a';
    expect(extractEdges(body, grammar([]))).toEqual([]);
  });

  it('fails loud on a declared unit-ref field with an empty value', () => {
    const body = '## impl:feature/x\n- depends-on:';
    expect(() => extractEdges(body, grammar())).toThrow(DocumentModelError);
    expect(() => extractEdges(body, grammar())).toThrow(/depends-on/);
  });

  it('fails loud on a declared prose field with an empty value', () => {
    const body = '## impl:feature/x\n- deferred-until:   ';
    expect(() => extractEdges(body, grammar())).toThrow(/deferred-until/);
  });
});
