// T035 (RED-first, US3, 006) — mutations.advance (lifecycle status change) +
// mutations.defer (set/clear the prose deferred-until). Both re-validate the
// whole graph and are zero-write on failure (FR-009/FR-010/R7).

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advance, defer } from '../../src/roadmap/mutations.js';
import { ready } from '../../src/roadmap/graph.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { DocumentModelError } from '../../src/document-model/types.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mut-ad-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('mutations.advance (T035)', () => {
  it('changes an item status along the lifecycle (--apply)', () => {
    const docPath = tmpCopy('chain');
    advance(docPath, 'impl:feature/b', 'in-flight', ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/b')!.status).toBe('in-flight');
  });

  it('refuses a status outside the vocabulary — zero write', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(() => advance(docPath, 'impl:feature/b', 'bogus', ROADMAP_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('refuses an unknown item — zero write', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(() => advance(docPath, 'impl:feature/ghost', 'shipped', ROADMAP_OPTS, true)).toThrow(
      DocumentModelError,
    );
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});

describe('mutations.defer (T035)', () => {
  it('sets a prose deferred-until and thereby blocks readiness', () => {
    const docPath = tmpCopy('chain');
    defer(docPath, 'impl:feature/b', { until: 'after the spike' }, ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/b')!.deferredUntil).toBe('after the spike');
    expect(ready(model).map((i) => i.identifier)).not.toContain('impl:feature/b');
  });

  it('clears a deferred-until, restoring readiness', () => {
    const docPath = tmpCopy('deferred');
    defer(docPath, 'impl:feature/b', { clear: true }, ROADMAP_OPTS, true);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:feature/b')!.deferredUntil).toBeNull();
    expect(ready(model).map((i) => i.identifier)).toContain('impl:feature/b');
  });
});
