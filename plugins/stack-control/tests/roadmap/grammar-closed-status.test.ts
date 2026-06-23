// T002 (RED-first, Foundational, 031) — the built-in roadmap grammar admits the
// new terminal status `closed`: `statusVocabulary` includes it AND
// `terminalStatuses` includes it (grammars/roadmap.peg frontmatter). The closer
// + advance read the grammar-derived terminal set, so this is the single source
// of the `closed` terminality (no hardcoded duplicate — data-model § WorkItem).

import { describe, it, expect } from 'vitest';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { writeTempRoadmap, ROADMAP_OPTS } from './helpers.js';

describe('roadmap grammar admits `closed` (T002, FR-012)', () => {
  it('statusVocabulary and terminalStatuses both include `closed`', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: shipped']);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.doc.grammar.statusVocabulary).toContain('closed');
    expect(model.doc.grammar.terminalStatuses).toContain('closed');
  });
});
