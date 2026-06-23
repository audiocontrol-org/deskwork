// T004 (RED-first, Foundational, 031) — a roadmap node at `- status: closed`
// loads without throwing AND `isTerminal(model, item)` is true for it. The
// terminal set is grammar-derived (graph.ts reads grammar.terminalStatuses), so
// the GREEN is satisfied by the grammar edit alone — no hardcoded status set.

import { describe, it, expect } from 'vitest';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { isTerminal } from '../../src/roadmap/graph.js';
import { writeTempRoadmap, ROADMAP_OPTS } from './helpers.js';

describe('roadmap-model treats `closed` as terminal (T004, FR-012)', () => {
  it('loads a `closed` node and reports it terminal', () => {
    const docPath = writeTempRoadmap(['## multi:feature/done-and-closed', '- status: closed']);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    const item = model.byId.get('multi:feature/done-and-closed');
    expect(item).toBeDefined();
    expect(item!.status).toBe('closed');
    expect(isTerminal(model, item!)).toBe(true);
  });
});
