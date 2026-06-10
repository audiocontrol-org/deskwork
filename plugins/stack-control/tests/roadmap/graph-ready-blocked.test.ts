// T018 (RED-first, US1, 006) — `ready` + `blockedBy` over chain/diamond/
// deferred/terminal fixtures. Ready iff every depends-on target is `shipped`,
// no `deferred-until`, item non-terminal (FR-012). A cancelled/retired dep is a
// blocker, never satisfied (R4). Terminal items are never "ready".

import { describe, it, expect } from 'vitest';
import { blockedBy, ready } from '../../src/roadmap/graph.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

const ids = (items: readonly { identifier: string }[]) => items.map((i) => i.identifier);

describe('ready (T018, FR-012)', () => {
  it('chain: only the item whose deps are all shipped is ready', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    expect(ids(ready(model))).toEqual(['impl:feature/b']);
  });

  it('diamond: both arms are ready; the join is not', () => {
    const model = loadRoadmap(fixturePath('diamond'), ROADMAP_OPTS);
    expect(ids(ready(model)).sort()).toEqual(['impl:feature/b', 'impl:feature/c']);
  });

  it('deferred: a set deferred-until blocks readiness even when the hard dep is shipped', () => {
    const model = loadRoadmap(fixturePath('deferred'), ROADMAP_OPTS);
    expect(ids(ready(model))).toEqual([]);
  });

  it('terminal dep: a cancelled dependency blocks; a shipped-only dependent is ready', () => {
    const model = loadRoadmap(fixturePath('terminal-dep'), ROADMAP_OPTS);
    expect(ids(ready(model))).toEqual(['multi:feature/e']);
  });

  it('terminal items themselves are never ready', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    expect(ids(ready(model))).not.toContain('design:feature/a');
  });
});

describe('blockedBy (T018, FR-013)', () => {
  it('names the unmet (non-shipped) dependency with its status', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    const report = blockedBy(model, 'impl:feature/c');
    expect(report.unmetDependencies).toEqual([{ identifier: 'impl:feature/b', status: 'planned' }]);
    expect(report.deferredUntil).toBeNull();
  });

  it('reports the deferred condition when set', () => {
    const model = loadRoadmap(fixturePath('deferred'), ROADMAP_OPTS);
    const report = blockedBy(model, 'impl:feature/b');
    expect(report.unmetDependencies).toEqual([]);
    expect(report.deferredUntil).toBe('after the migration milestone closes');
  });

  it('a cancelled dependency is reported as an unmet blocker (never satisfied)', () => {
    const model = loadRoadmap(fixturePath('terminal-dep'), ROADMAP_OPTS);
    const report = blockedBy(model, 'multi:feature/d');
    expect(report.unmetDependencies).toEqual([{ identifier: 'impl:feature/b', status: 'cancelled' }]);
  });

  it('a ready item has no blockers', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    const report = blockedBy(model, 'impl:feature/b');
    expect(report.unmetDependencies).toEqual([]);
    expect(report.deferredUntil).toBeNull();
  });
});
