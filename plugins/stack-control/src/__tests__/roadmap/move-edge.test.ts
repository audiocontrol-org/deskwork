// T067 (RED-first, US2, 028) — roadmap.moveEdge (reparent): remove(fromParent)
// + add(toParent) in ONE validated move. A `--from` that does NOT currently hold
// the edge → DocumentModelError (exit-2 class). `roadmap order` stays clean (no
// cycle) after (FR-014; contract RM1 + US2 scenario 3). TASK-137 reparent.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { moveEdge } from '../../roadmap/edge-mutations.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { order } from '../../roadmap/graph.js';
import { DocumentModelError } from '../../document-model/types.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('roadmap.moveEdge (T067)', () => {
  it('reparents a part-of edge from one parent to another (--apply)', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/p1',
      '- status: planned',
      '',
      '## multi:feature/p2',
      '- status: planned',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- part-of: multi:feature/p1',
    ]);
    moveEdge(
      docPath,
      'impl:feature/x',
      'part-of',
      'multi:feature/p1',
      'multi:feature/p2',
      ROADMAP_OPTS,
      true,
    );
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.partOf).toEqual(['multi:feature/p2']);
  });

  it('reparents a depends-on edge and roadmap order stays clean (US2 scenario 3)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## design:feature/b',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    moveEdge(
      docPath,
      'impl:feature/x',
      'depends-on',
      'design:feature/a',
      'design:feature/b',
      ROADMAP_OPTS,
      true,
    );
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/x')!.dependsOn).toEqual(['design:feature/b']);
    // order() throws on a cycle; a clean topo order means the move stayed valid.
    const ids = order(model).map((i) => i.identifier);
    expect(ids).toContain('impl:feature/x');
    expect(ids.indexOf('design:feature/b')).toBeLessThan(ids.indexOf('impl:feature/x'));
  });

  it('refuses when --from does not currently hold the edge (exit-2 class) zero-write', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/p1',
      '- status: planned',
      '',
      '## multi:feature/p2',
      '- status: planned',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- part-of: multi:feature/p1',
    ]);
    const before = readFileSync(docPath, 'utf8');
    // p2 does not hold the edge; moving FROM p2 must refuse.
    expect(() =>
      moveEdge(
        docPath,
        'impl:feature/x',
        'part-of',
        'multi:feature/p2',
        'multi:feature/p1',
        ROADMAP_OPTS,
        true,
      ),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('zero-write when the move would create a cycle', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/a',
      '- status: planned',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- depends-on: impl:feature/a',
      '',
      '## impl:feature/c',
      '- status: shipped',
    ]);
    const before = readFileSync(docPath, 'utf8');
    // Move a's (nonexistent) edge — but here test the cycle path: give `a` a dep
    // on c, then move it to b → a depends-on b, while b depends-on a ⇒ cycle.
    expect(() =>
      moveEdge(
        docPath,
        'impl:feature/a',
        'depends-on',
        'impl:feature/c',
        'impl:feature/b',
        ROADMAP_OPTS,
        true,
      ),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an unknown --to target zero-write', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/p1',
      '- status: planned',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- part-of: multi:feature/p1',
    ]);
    const before = readFileSync(docPath, 'utf8');
    expect(() =>
      moveEdge(
        docPath,
        'impl:feature/x',
        'part-of',
        'multi:feature/p1',
        'multi:feature/ghost',
        ROADMAP_OPTS,
        true,
      ),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
