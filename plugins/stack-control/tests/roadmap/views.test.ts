// T030 (RED-first, US4, 006) — derived views: ready-list / blocked-report
// formatting + a mermaid flowchart from depends-on edges (FR-014/FR-015).
// Views are computed on demand and never persisted.

import { describe, it, expect } from 'vitest';
import { blockedReport, mermaid, readyList } from '../../src/roadmap/views.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

describe('readyList (T030)', () => {
  it('lists ready items and excludes blocked ones', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    const out = readyList(model);
    expect(out).toContain('impl:feature/b');
    expect(out).not.toContain('impl:feature/c');
  });

  it('surfaces each ready item status so in-flight is distinct from planned (AUDIT-20260608-02)', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    const out = readyList(model);
    // impl:feature/b is ready AND planned — the status must be visible on the line
    // so a fresh agent can tell pickable (planned) work from in-flight work.
    expect(out).toContain('impl:feature/b (planned)');
  });
});

describe('blockedReport (T030)', () => {
  it('names blocked items with their non-shipped dependency + status', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    const out = blockedReport(model);
    expect(out).toContain('impl:feature/c');
    expect(out).toContain('impl:feature/b');
    expect(out).toContain('planned');
  });

  it('surfaces a deferred-until condition', () => {
    const model = loadRoadmap(fixturePath('deferred'), ROADMAP_OPTS);
    const out = blockedReport(model);
    expect(out).toMatch(/defer/i);
    expect(out).toContain('after the migration milestone closes');
  });
});

describe('mermaid (T030, FR-014)', () => {
  it('emits a flowchart with a node per item and an edge per depends-on', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    const out = mermaid(model);
    expect(out).toMatch(/^flowchart/m);
    // One labelled node per item.
    expect(out).toContain('design:feature/a');
    expect(out).toContain('impl:feature/b');
    expect(out).toContain('impl:feature/c');
    // Two depends-on edges (b->a, c->b) rendered as dependency --> dependent.
    expect((out.match(/-->/g) ?? []).length).toBe(2);
  });
});
