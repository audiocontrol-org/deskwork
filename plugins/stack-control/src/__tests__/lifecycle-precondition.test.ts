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
