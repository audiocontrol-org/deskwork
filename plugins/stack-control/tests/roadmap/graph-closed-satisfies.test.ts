// AUDIT-20260623-02 (RED-first, 031) — `depends-on` satisfaction must understand
// the post-ship terminal `closed` status: a dependency that has moved
// `shipped → closed` is MORE done than shipped, so it MUST still satisfy the edge
// (its dependents stay ready). The pre-031 rule hardcoded satisfaction to exactly
// `shipped`, so closing a dependency would wrongly re-block its dependents. A
// `cancelled`/`retired` dependency is still a permanent blocker (never satisfied).

import { describe, it, expect } from 'vitest';
import { blockedBy, isReady, ready } from '../../src/roadmap/graph.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { writeTempRoadmap, ROADMAP_OPTS } from './helpers.js';

const ids = (items: readonly { identifier: string }[]) => items.map((i) => i.identifier);

describe('closed satisfies depends-on (AUDIT-20260623-02, FR-003)', () => {
  it('a dependent of a CLOSED item is ready (closed satisfies, like shipped)', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/dep',
      '- status: closed',
      '## impl:feature/dependent',
      '- status: planned',
      '- depends-on: multi:feature/dep',
    ]);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(ids(ready(model))).toContain('impl:feature/dependent');
    expect(blockedBy(model, 'impl:feature/dependent').unmetDependencies).toEqual([]);
    expect(isReady(model, model.byId.get('impl:feature/dependent')!)).toBe(true);
  });

  it('a CANCELLED dependency still blocks (only shipped/closed satisfy)', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/dead',
      '- status: cancelled',
      '## impl:feature/downstream',
      '- status: planned',
      '- depends-on: multi:feature/dead',
    ]);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(ids(ready(model))).not.toContain('impl:feature/downstream');
    expect(blockedBy(model, 'impl:feature/downstream').unmetDependencies).toEqual([
      { identifier: 'multi:feature/dead', status: 'cancelled' },
    ]);
  });

  it('mixed: a dependent satisfied by one shipped + one closed dep is ready', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/s',
      '- status: shipped',
      '## multi:feature/c',
      '- status: closed',
      '## impl:feature/joins',
      '- status: planned',
      '- depends-on: multi:feature/s, multi:feature/c',
    ]);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(ids(ready(model))).toContain('impl:feature/joins');
  });
});
