// T037 (RED-first, US3, 006) — mutations.decompose: split one item into N peers;
// former dependents are repointed onto the parts; the new parts inherit the
// original's dependencies; the whole graph re-validates and a graph-invalidating
// decompose is zero-write (FR-009/FR-010/R7).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decompose } from '../../src/roadmap/mutations.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { ready } from '../../src/roadmap/graph.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { ROADMAP_OPTS, writeTempRoadmap } from './helpers.js';

describe('mutations.decompose (T037)', () => {
  it('splits one→N: removes the original, adds parts, repoints former dependents', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
      '',
      '## multi:feature/d',
      '- status: planned',
      '- depends-on: impl:feature/x',
    ]);
    decompose(docPath, 'impl:feature/x', ['impl:feature/x1', 'impl:feature/x2'], ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:feature/x')).toBe(false);
    expect(model.byId.has('impl:feature/x1')).toBe(true);
    expect(model.byId.has('impl:feature/x2')).toBe(true);
    // Parts inherit the original's dependency.
    expect(model.byId.get('impl:feature/x1')!.dependsOn).toEqual(['design:feature/a']);
    // Former dependent now points at both parts.
    expect(model.byId.get('multi:feature/d')!.dependsOn).toEqual([
      'impl:feature/x1',
      'impl:feature/x2',
    ]);
  });

  it('carries deferred-until, spec, ref, and scope onto every part (AUDIT-20260608-03)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
      '- deferred-until: design:feature/a ships',
      '- spec: specs/007-x/spec.md',
      '- ref: https://example.org/x',
      'The original x scope prose.',
    ]);
    decompose(docPath, 'impl:feature/x', ['impl:feature/x1', 'impl:feature/x2'], ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);

    for (const partId of ['impl:feature/x1', 'impl:feature/x2']) {
      const part = model.byId.get(partId);
      expect(part).toBeDefined();
      // The critical carry: a decomposed deferred item must STAY deferred.
      expect(part!.deferredUntil).toBe('design:feature/a ships');
      // Descriptive fields ride along so the parts aren't bare identifiers.
      expect(part!.spec).toBe('specs/007-x/spec.md');
      expect(part!.ref).toBe('https://example.org/x');
      expect(part!.scope).toBe('The original x scope prose.');
    }

    // The deferral being carried means NEITHER part is silently un-deferred into
    // the ready frontier.
    const readyIds = ready(model).map((i) => i.identifier);
    expect(readyIds).not.toContain('impl:feature/x1');
    expect(readyIds).not.toContain('impl:feature/x2');
  });

  it('a decompose that invalidates the graph (into reuses an existing id) is zero-write', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/a',
      '- status: planned',
      '',
      '## impl:feature/b',
      '- status: planned',
      '- depends-on: impl:feature/a',
    ]);
    const before = readFileSync(docPath, 'utf8');
    // Splitting `a` into a set that includes the already-existing `b` reuses an
    // identifier — the re-validate rejects it; the document must be unchanged.
    expect(() =>
      decompose(docPath, 'impl:feature/a', ['impl:feature/b'], ROADMAP_OPTS, true),
    ).toThrow(DocumentModelError);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('requires at least one --into target', () => {
    const docPath = writeTempRoadmap(['## impl:feature/x', '- status: planned']);
    expect(() => decompose(docPath, 'impl:feature/x', [], ROADMAP_OPTS, true)).toThrow(
      DocumentModelError,
    );
  });
});
