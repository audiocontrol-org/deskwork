// T016 (RED-first, 006) — roadmap-model loads a roadmap document into a typed
// WorkItem[]: phase/kind parsed from the identifier; dependsOn/partOf/
// deferredUntil/spec/ref populated from the parsed edges (data-model.md).

import { describe, it, expect } from 'vitest';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('roadmap-model loadRoadmap (T016)', () => {
  it('projects Units into WorkItems with phase/kind and edges', () => {
    const model = loadRoadmap(fixturePath('diamond'), ROADMAP_OPTS);
    const b = model.items.find((i) => i.identifier === 'impl:feature/b')!;
    expect(b.phase).toBe('impl');
    expect(b.kind).toBe('feature');
    expect(b.status).toBe('planned');
    expect(b.dependsOn).toEqual(['design:feature/a']);
    expect(b.partOf).toBe('design:feature/a');
    expect(b.deferredUntil).toBeNull();

    const d = model.items.find((i) => i.identifier === 'multi:feature/d')!;
    expect(d.dependsOn).toEqual(['impl:feature/b', 'impl:feature/c']);
    expect(d.partOf).toBeNull();
  });

  it('populates deferredUntil, spec and ref from their fields', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- depends-on: design:feature/a',
      '- deferred-until: after the milestone closes',
      '- spec: specs/002-parallel-execution-engine',
      '- ref: "#123"',
      'Scope prose for B.',
    ]);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    const b = model.items.find((i) => i.identifier === 'impl:feature/b')!;
    expect(b.deferredUntil).toBe('after the milestone closes');
    expect(b.spec).toBe('specs/002-parallel-execution-engine');
    expect(b.ref).toBe('#123');
    expect(b.scope).toContain('Scope prose for B.');
  });

  it('exposes a byId lookup and preserves document order', () => {
    const model = loadRoadmap(fixturePath('chain'), ROADMAP_OPTS);
    expect(model.items.map((i) => i.identifier)).toEqual([
      'design:feature/a',
      'impl:feature/b',
      'impl:feature/c',
    ]);
    expect(model.byId.get('impl:feature/b')?.kind).toBe('feature');
  });
});
