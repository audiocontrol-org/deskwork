// 024 US6 / FR-013 — one canonical feature identity across compass, govern, the
// convergence record, and close-related. RED first (T002/T004/T011): the
// convergence record is keyed by the canonical node id, NOT the spec-dir basename,
// so two items whose spec dirs share a basename never collide (TASK-139).

import { afterEach, describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { buildItemContext } from '../../workflow/workflow-context.js';
import {
  convergenceKeyFor,
  resolveIdentity,
  resolveIdentityFromSpecDir,
} from '../../workflow/identity.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(): WorkflowFixture {
  const f = makeWorkflowFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

/** Two distinct items whose spec dirs share a basename (`compass`) — the TASK-139 shape. */
function collisionRoadmap(f: WorkflowFixture): void {
  f.setRoadmap([
    { identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/010-compass' },
    { identifier: 'multi:feature/b', status: 'in-flight', spec: 'specs/020-compass' },
  ]);
}

describe('024 FR-013 — canonical identity resolver', () => {
  it('resolveIdentity returns the node id as nodeId and the node spec as specPointer', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/010-compass' }]);
    const model = loadRoadmap(f.roadmapPath, f.opts);
    const item = model.byId.get('multi:feature/a')!;
    const id = resolveIdentity(f.root, item);
    expect(id.nodeId).toBe('multi:feature/a');
    expect(id.specPointer).toBe('specs/010-compass');
    expect(id.specDir).toBe(`${f.root}/specs/010-compass`);
  });

  it('convergenceKeyFor returns the node id, not the spec-dir basename (TASK-139)', () => {
    const f = fixture();
    collisionRoadmap(f);
    const model = loadRoadmap(f.roadmapPath, f.opts);
    const a = model.byId.get('multi:feature/a')!;
    const b = model.byId.get('multi:feature/b')!;
    // Both spec dirs basename to 'compass'; the canonical key must still differ.
    expect(convergenceKeyFor(a)).toBe('multi:feature/a');
    expect(convergenceKeyFor(b)).toBe('multi:feature/b');
    expect(convergenceKeyFor(a)).not.toBe(convergenceKeyFor(b));
  });

  it('resolveIdentityFromSpecDir maps a governed feature dir to its node id', () => {
    const f = fixture();
    collisionRoadmap(f);
    const model = loadRoadmap(f.roadmapPath, f.opts);
    expect(resolveIdentityFromSpecDir(model, 'specs/010-compass')?.nodeId).toBe('multi:feature/a');
    expect(resolveIdentityFromSpecDir(model, 'specs/020-compass')?.nodeId).toBe('multi:feature/b');
    // An absolute path inside the installation resolves the same node.
    expect(resolveIdentityFromSpecDir(model, `${f.root}/specs/020-compass`)?.nodeId).toBe(
      'multi:feature/b',
    );
    // An unknown spec dir resolves to null (an orphan / legacy feature).
    expect(resolveIdentityFromSpecDir(model, 'specs/999-nope')).toBeNull();
  });
});

describe('024 US6 — compass / govern / close-related agree on one identity', () => {
  it('the canonical nodeId IS the roadmap node id close-related and the compass key by', () => {
    const f = fixture();
    collisionRoadmap(f);
    const model = loadRoadmap(f.roadmapPath, f.opts);
    for (const item of model.items) {
      // close-related resolves `model.byId.get(<id>)`; the compass resolves the
      // item the same way; both must equal the canonical nodeId (US6.2).
      expect(resolveIdentity(f.root, item).nodeId).toBe(item.identifier);
      expect(model.byId.get(resolveIdentity(f.root, item).nodeId)).toBe(item);
    }
  });
});

describe('024 FR-013 — legacy migration (read-side fail-safe)', () => {
  it('a record under the OLD basename key is not read as the node converged (gate stays closed)', () => {
    const f = fixture();
    f.setRoadmap([{ identifier: 'multi:feature/a', status: 'in-flight', spec: 'specs/010-compass' }]);
    const model = loadRoadmap(f.roadmapPath, f.opts);
    const a = model.byId.get('multi:feature/a')!;
    // A stale record keyed by the legacy spec-dir basename ('010-compass').
    f.writeRecord({
      version: 1,
      mode: 'impl',
      item: '010-compass',
      scopeFingerprint: 'legacy',
      converged: true,
      recordedAt: '2026-06-16T00:00:00.000Z',
    });
    // The node reads NOT converged (no fabrication from the stale key); the next
    // govern run re-establishes it under the canonical node id (fail-safe).
    expect(buildItemContext(f.root, a).inputs.implRecordConverged).toBe(false);
  });
});

describe('024 FR-013 — convergence record keyed by canonical identity', () => {
  it('governing item A does not mark a basename-sharing item B converged (SC-005)', () => {
    const f = fixture();
    collisionRoadmap(f);
    const doc = loadWorkflowDoc(f.root);
    const model = loadRoadmap(f.roadmapPath, f.opts);
    const a = model.byId.get('multi:feature/a')!;
    const b = model.byId.get('multi:feature/b')!;

    // Record convergence for A under its canonical key.
    f.writeRecord({
      version: 1,
      mode: 'impl',
      item: convergenceKeyFor(a),
      scopeFingerprint: 'fp-a',
      converged: true,
      recordedAt: '2026-06-16T00:00:00.000Z',
    });

    // A reads converged; B (shared basename) must NOT.
    expect(buildItemContext(f.root, a).inputs.implRecordConverged).toBe(true);
    expect(buildItemContext(f.root, b).inputs.implRecordConverged).toBe(false);
  });
});
