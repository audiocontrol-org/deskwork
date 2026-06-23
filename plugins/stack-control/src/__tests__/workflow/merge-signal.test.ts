// 032 US3 (T017) — `mergedButInFlight(item, installationRoot)`: the per-item git
// signal the off-rail backstop keys on. An item is merged-but-status-in-flight when
// its `impl` govern convergence-record commit is reachable from the default branch
// (origin/main) while its recorded status is still in-flight (∉ {shipped, closed}).
// Portable (git-only, no gh-API), per-item, independent of whether ship ran. Returns
// null when the record is absent / not reachable / the status is already shipped or
// closed / the base is undeterminable. RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { mergedButInFlight } from '../../workflow/merge-signal.js';
import { makeWorkflowFixture, type FixtureNode, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function itemOf(f: WorkflowFixture) {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!;
}

/** Build a fixture with a node + (optionally) a committed impl convergence record. */
function fixture(node: FixtureNode, opts: { withRecord?: boolean; baseAtRecord?: boolean } = {}): WorkflowFixture {
  const f = makeWorkflowFixture([node], { git: true });
  fixtures.push(f);
  f.commitAll('seed');
  if (opts.withRecord === true) {
    f.writeRecord({
      version: 1, mode: 'impl', item: ITEM, scopeFingerprint: 'abc', converged: true,
      recordedAt: '2026-06-23T00:00:00Z',
    });
    f.commitAll('govern: converged record');
  }
  // baseAtRecord: origin/main points at the record commit (merged). Otherwise origin/main
  // sits at the pre-record `seed` commit (the record is NOT reachable from base).
  const baseRef = opts.baseAtRecord === true ? 'HEAD' : 'HEAD~1';
  f.git(['update-ref', 'refs/remotes/origin/main', f.git(['rev-parse', baseRef]).trim()]);
  return f;
}

describe('032 US3 — mergedButInFlight (T017)', () => {
  it('returns the item when the record commit is reachable from base AND status is in-flight', () => {
    const f = fixture({ identifier: ITEM, status: 'in-flight' }, { withRecord: true, baseAtRecord: true });
    const r = mergedButInFlight(itemOf(f), f.root);
    expect(r).not.toBeNull();
    expect(r!.itemId).toBe(ITEM);
    expect(r!.recordCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('returns null when the record is absent', () => {
    const f = fixture({ identifier: ITEM, status: 'in-flight' }, { withRecord: false, baseAtRecord: true });
    expect(mergedButInFlight(itemOf(f), f.root)).toBeNull();
  });

  it('returns null when the record commit is NOT reachable from base (off to one side)', () => {
    const f = fixture({ identifier: ITEM, status: 'in-flight' }, { withRecord: true, baseAtRecord: false });
    expect(mergedButInFlight(itemOf(f), f.root)).toBeNull();
  });

  it('returns null when the status is already shipped (not dangling)', () => {
    const f = fixture({ identifier: ITEM, status: 'shipped' }, { withRecord: true, baseAtRecord: true });
    expect(mergedButInFlight(itemOf(f), f.root)).toBeNull();
  });

  it('returns null when the status is closed (terminal, not dangling)', () => {
    const f = fixture({ identifier: ITEM, status: 'closed' }, { withRecord: true, baseAtRecord: true });
    expect(mergedButInFlight(itemOf(f), f.root)).toBeNull();
  });

  it('returns null when the base is undeterminable (no remote default branch)', () => {
    const f = makeWorkflowFixture([{ identifier: ITEM, status: 'in-flight' }], { git: true });
    fixtures.push(f);
    f.commitAll('seed');
    f.writeRecord({
      version: 1, mode: 'impl', item: ITEM, scopeFingerprint: 'abc', converged: true,
      recordedAt: '2026-06-23T00:00:00Z',
    });
    f.commitAll('govern: converged record');
    // no origin/main set → resolveBase undeterminable → null (fail-open detection)
    expect(mergedButInFlight(itemOf(f), f.root)).toBeNull();
  });
});
