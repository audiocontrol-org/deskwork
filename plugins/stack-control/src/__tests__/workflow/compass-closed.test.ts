// T027 (031 US3, FR-015) — the compass `close` intent + `closed` terminal rules.
//   • compass <shipped item> --intent close → on-course (shipped→closed is the
//     legitimate next move);
//   • compass <closed item> --intent <anything non-neutral> → no legitimate forward
//     move (closed is terminal — off-rail/ahead, never on-course);
//   • compass <pre-shipped item> --intent close → ahead (closed is a later phase;
//     the shipped step is skipped).
// Exercises the pure computeVerdict + resolveIntent (mirrors compass.test.ts). RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import type { DerivedPhase, WorkflowDoc } from '../../workflow/workflow-types.js';
import { computeVerdict } from '../../workflow/compass.js';
import { resolveIntent } from '../../workflow/intent-vocabulary.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function doc(): WorkflowDoc {
  const f = makeWorkflowFixture();
  fixtures.push(f);
  return loadWorkflowDoc(f.root);
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

const phase = (id: string): DerivedPhase => ({ kind: 'phase', id });

function verdict(d: WorkflowDoc, current: DerivedPhase, intentName: string) {
  const intent = resolveIntent(d, intentName);
  expect(intent).not.toBeNull(); // `close` must be a known intent (T028)
  return computeVerdict({ doc: d, currentPhase: current, intent: intent!, hasNode: true });
}

describe('031 T027 — compass close intent + closed terminal rules (FR-015)', () => {
  it('close resolves to the closed phase (a known intent)', () => {
    const d = doc();
    const r = resolveIntent(d, 'close');
    expect(r).toEqual({ kind: 'phase', phase: 'closed' });
  });

  it('validating --intent close → on-course (the legitimate next move; 032)', () => {
    const d = doc();
    // 032: `status: shipped` derives the `validating` phase, whose legitimate next is `closed`.
    const v = verdict(d, phase('validating'), 'close');
    expect(v.outcome).toBe('on-course');
    expect(v.exitCode).toBe(0);
    expect(v.legitimateNext).toBe('closed');
  });

  it('closed --intent close → no legitimate forward move (terminal, not on-course)', () => {
    const d = doc();
    const v = verdict(d, phase('closed'), 'close');
    // `closed` is terminal: its `next` is null, and `close` (== current phase)
    // is at-or-before → behind (re-entry/redundant), never a forward on-course
    // toward a later phase. The key invariant: there is NO legitimate forward move.
    expect(v.legitimateNext).toBeNull();
    expect(v.skippedStep).toBeNull();
    expect(v.outcome).not.toBe('ahead');
  });

  it('closed --intent ship → behind (closed is past shipped; no forward move)', () => {
    const d = doc();
    const v = verdict(d, phase('closed'), 'ship');
    expect(v.legitimateNext).toBeNull();
    expect(v.outcome).toBe('behind'); // shipped <= closed, re-entry/redundant (allowed)
    expect(v.exitCode).toBe(0);
  });

  it('pre-merge (governing) --intent close → ahead, the merging step is skipped (032)', () => {
    const d = doc();
    const v = verdict(d, phase('governing'), 'close');
    expect(v.outcome).toBe('ahead');
    expect(v.exitCode).not.toBe(0);
    expect(v.skippedStep).toBe('merging'); // the immediate next phase out of governing (032)
  });
});
