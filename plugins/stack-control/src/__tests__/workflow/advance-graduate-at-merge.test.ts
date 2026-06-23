// 032 US1 (T007/T009) — the `graduate` transition is REWIRED to fire at MERGE:
// `merging → validating`, gate `graduate-impl impl`, effects `roadmap-advance
// to=shipped; roadmap-reconcile; journal-append; commit` (commit last). Firing it on
// a govern-converged item records `status: shipped` and derives phase `validating`.
// `workflow advance` on a govern-converged (merging) item fires graduate; the gate
// refuses (exit 1) when graduate-impl is unmet. RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});
function statusOf(f: WorkflowFixture): string {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.status;
}

/** A govern-converged item (impl convergence record present), status still in-flight → derives `merging`. */
function mergingFixture(): WorkflowFixture {
  const f = makeWorkflowFixture(
    [{ identifier: ITEM, status: 'in-flight', design: 'd', spec: 'specs/x', analyzeClean: true }],
    { git: true },
  );
  fixtures.push(f);
  f.writeSpecTasks('specs/x', true);
  f.writeRecord({
    version: 1,
    mode: 'impl',
    item: ITEM,
    scopeFingerprint: 'abc',
    converged: true,
    recordedAt: '2026-06-23T00:00:00Z',
  });
  f.commitAll('govern: converged whole-feature record');
  return f;
}

describe('032 US1 — graduate fires at merge (merging → validating; records status:shipped)', () => {
  it('the bundled graduate transition is merging → validating with the expected gate + effect order', () => {
    const f = mergingFixture();
    const doc = loadWorkflowDoc(f.root);
    const graduate = doc.transitions.find((t) => t.codename === 'graduate');
    expect(graduate).toBeDefined();
    expect(graduate!.from).toBe('merging');
    expect(graduate!.to).toBe('validating');
    expect(graduate!.exitGate.some((c) => c.kind === 'graduate-impl' && c.target === 'impl')).toBe(true);
    const verbs = graduate!.effects.map((e) => e.verb);
    expect(verbs).toEqual(['roadmap-advance', 'roadmap-reconcile', 'journal-append', 'commit']);
    expect(verbs[verbs.length - 1]).toBe('commit'); // commit is the atomic boundary (last)
    // the roadmap-advance effect records status=shipped
    const adv = graduate!.effects.find((e) => e.verb === 'roadmap-advance');
    expect(adv!.args.to).toBe('shipped');
  });

  it('a govern-converged item derives merging; advance --apply fires graduate → records status:shipped → derives validating', () => {
    const f = mergingFixture();
    // SC-006 / FR-013: recording status:shipped needs NO GitHub remote — the fixture has
    // a local git repo with NO remote configured, and graduate records shipped anyway.
    expect(f.git(['remote']).trim()).toBe('');
    // derives merging (govern-converged, status in-flight)
    const before = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(before.status).toBe(0);
    expect(before.stdout).toContain('phase: merging');

    // advance --apply fires graduate (the weld): records status:shipped + reconcile + journal + commit
    const adv = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(adv.status).toBe(0);
    expect(adv.stdout).toContain('applied graduate (merging -> validating)');
    expect(statusOf(f)).toBe('shipped');
    expect(f.git(['status', '--porcelain']).trim()).toBe(''); // committed

    // now derives validating (post-merge verify window)
    const after = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(after.stdout).toContain('phase: validating');
  });

  it('the graduate gate REFUSES (exit 1) when graduate-impl is unmet (no converged record)', () => {
    const f = makeWorkflowFixture(
      [{ identifier: ITEM, status: 'in-flight', design: 'd', spec: 'specs/x', analyzeClean: true }],
      { git: true },
    );
    fixtures.push(f);
    f.writeSpecTasks('specs/x', true); // tasks complete → governing, but NO convergence record
    f.commitAll('seed');
    const r = runCli(['workflow', 'advance', ITEM, '--apply'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/refus/i);
    expect(r.stdout + r.stderr).toMatch(/graduate-impl/);
    expect(statusOf(f)).toBe('in-flight'); // did NOT record shipped
  });
});
