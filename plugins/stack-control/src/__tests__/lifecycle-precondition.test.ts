// 024 US2 / FR-006/FR-007 — the shared lifecycle-skill precondition. Every
// lifecycle skill opens by consulting the compass for its item + its own intent and
// refuses loud (performing no work) on a non-zero verdict. The rules live in ONE
// place (the compass) invoked through this helper — not re-encoded per skill. RED
// first (T022). SC-002.

import { afterEach, describe, expect, it } from 'vitest';
import { checkLifecyclePrecondition } from '../lifecycle-precondition.js';
import { WorkflowError } from '../workflow/workflow-types.js';
import { makeWorkflowFixture, type WorkflowFixture } from './fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(nodes: Parameters<typeof makeWorkflowFixture>[0]): WorkflowFixture {
  const f = makeWorkflowFixture(nodes);
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

const ITEM = 'multi:feature/x';
const check = (root: string, item: string, intent: string) =>
  checkLifecyclePrecondition({ item, intent, cwd: root });

describe('024 US2 — checkLifecyclePrecondition', () => {
  it('refuses (proceed:false) an ahead action, naming the skipped step', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned' }]);
    const r = check(f.root, ITEM, 'define'); // specifying from planned skips designing
    expect(r.proceed).toBe(false);
    expect(r.verdict.outcome).toBe('ahead');
    expect(r.verdict.skippedStep).toBe('designing');
  });

  it('refuses (proceed:false) an off-rail action (no node), naming the missing node', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned' }]);
    const r = check(f.root, 'multi:feature/orphan', 'design');
    expect(r.proceed).toBe(false);
    expect(r.verdict.outcome).toBe('off-rail');
    expect(r.verdict.reason).toMatch(/node/i);
  });

  it('proceeds (proceed:true) on an on-course action', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned' }]);
    const r = check(f.root, ITEM, 'design');
    expect(r.proceed).toBe(true);
    expect(r.verdict.outcome).toBe('on-course');
  });

  it('proceeds (proceed:true) on a behind action (re-entry/redundant, allowed)', () => {
    const f = fixture([
      { identifier: ITEM, status: 'in-flight', design: 'd', spec: 'specs/x', analyzeClean: true },
    ]);
    f.writeSpecTasks('specs/x', false); // implementing
    const r = check(f.root, ITEM, 'design'); // designing < implementing → behind
    expect(r.proceed).toBe(true);
    expect(r.verdict.outcome).toBe('behind');
  });

  it('fails loud on an unknown intent (a skill must pass its own known name)', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned' }]);
    expect(() => check(f.root, ITEM, 'frobnicate')).toThrow(WorkflowError);
  });
});

describe('032 US3 — the shared precondition threads the off-rail backstop (AUDIT-20260623-08)', () => {
  const TARGET = 'multi:feature/target';
  const DANGLING = 'multi:feature/dangling';
  /** A git fixture with an advanceable TARGET + a dangling merged item (record reachable from base). */
  function danglingFixture(): WorkflowFixture {
    const f = makeWorkflowFixture(
      [
        { identifier: TARGET, status: 'planned' },
        { identifier: DANGLING, status: 'in-flight' },
      ],
      { git: true },
    );
    fixtures.push(f);
    f.commitAll('seed');
    f.writeRecord({
      version: 1, mode: 'impl', item: DANGLING, scopeFingerprint: 'abc', converged: true,
      recordedAt: '2026-06-23T00:00:00Z',
    });
    f.commitAll('govern: converged (dangling)');
    f.git(['update-ref', 'refs/remotes/origin/main', f.git(['rev-parse', 'HEAD']).trim()]);
    return f;
  }

  it('REFUSES a lifecycle precondition for an UNRELATED item while a dangling merged item exists', () => {
    // This is the gate `govern --item` + every lifecycle skill consults — it must enforce the
    // backstop, not only the `workflow compass` CLI path.
    const f = danglingFixture();
    const r = check(f.root, TARGET, 'design');
    expect(r.proceed).toBe(false);
    expect(r.verdict.outcome).toBe('off-rail');
    expect(r.verdict.reason).toContain(DANGLING);
  });

  it('ALLOWS the dangling item its own reconcile precondition (ship)', () => {
    const f = danglingFixture();
    const r = check(f.root, DANGLING, 'ship'); // ship → merging; the dangling item derives merging
    expect(r.proceed).toBe(true);
  });
});
