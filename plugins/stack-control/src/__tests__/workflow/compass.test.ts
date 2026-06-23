// 024 US1 / FR-002 — the compass verdict diffs an intended action's phase against
// the item's live derived phase: on-course / ahead (names the first skipped step) /
// behind / off-rail (no node or a terminal side-state). Pure over derivePhase + the
// doc's ordered phases. RED first (T017). SC-001.

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import type { DerivedPhase, WorkflowDoc } from '../../workflow/workflow-types.js';
import { VERDICT_EXIT } from '../../workflow/workflow-types.js';
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
const side = (id: 'blocked' | 'cancelled' | 'retired'): DerivedPhase => ({ kind: 'side-state', id });

function verdict(d: WorkflowDoc, current: DerivedPhase, intentName: string, hasNode = true) {
  const intent = resolveIntent(d, intentName)!;
  return computeVerdict({ doc: d, currentPhase: current, intent, hasNode });
}

describe('024 FR-002 — compass verdict matrix', () => {
  it('on-course: intent is the legitimate next move', () => {
    const d = doc();
    // planned → designing is next; intent design → on-course
    const v = verdict(d, phase('planned'), 'design');
    expect(v.outcome).toBe('on-course');
    expect(v.skippedStep).toBeNull();
    expect(v.exitCode).toBe(VERDICT_EXIT['on-course']);
  });

  it('ahead: intent belongs to a later phase, naming the FIRST skipped step', () => {
    const d = doc();
    // planned, intent define (specifying) skips designing
    const v = verdict(d, phase('planned'), 'define');
    expect(v.outcome).toBe('ahead');
    expect(v.skippedStep).toBe('designing');
    expect(v.legitimateNext).toBe('designing');
    expect(v.exitCode).toBe(VERDICT_EXIT.ahead);
    expect(v.exitCode).not.toBe(0);
  });

  it('ahead: ship from implementing skips governing', () => {
    const d = doc();
    const v = verdict(d, phase('implementing'), 'ship');
    expect(v.outcome).toBe('ahead');
    expect(v.skippedStep).toBe('governing');
  });

  it('on-course: ship from governing reaches merging (the ship-the-PR phase)', () => {
    // 032: ship → merging, governing's legitimate next. The graduate (record status:shipped)
    // fires at the merging→validating boundary, driven by the ship skill.
    expect(verdict(doc(), phase('governing'), 'ship').outcome).toBe('on-course');
  });

  it('T040/codex-01: ship from governing REFUSES when the graduation exit gate is unmet', () => {
    const d = doc();
    const unmet = [{ kind: 'graduate-impl', target: 'impl' } as const];
    const v = computeVerdict({
      doc: d,
      currentPhase: phase('governing'),
      intent: resolveIntent(d, 'ship')!,
      hasNode: true,
      nextGateUnmet: unmet,
    });
    expect(v.outcome).toBe('ahead'); // NOT on-course — the compass cannot green-light ship un-governed
    expect(v.exitCode).not.toBe(0);
    expect(v.unmetGate.length).toBeGreaterThan(0);
    expect(v.reason).toMatch(/graduate-impl impl|exit gate/i);
  });

  it('T040: ship from governing is on-course when the graduation gate is met (empty unmet)', () => {
    const d = doc();
    const v = computeVerdict({
      doc: d,
      currentPhase: phase('governing'),
      intent: resolveIntent(d, 'ship')!,
      hasNode: true,
      nextGateUnmet: [],
    });
    expect(v.outcome).toBe('on-course');
    expect(v.unmetGate).toEqual([]);
  });

  it('behind: intent at or before the current phase (re-entry/redundant, allowed)', () => {
    const d = doc();
    const v = verdict(d, phase('implementing'), 'design'); // designing < implementing
    expect(v.outcome).toBe('behind');
    expect(v.skippedStep).toBeNull();
    expect(v.exitCode).toBe(0);
  });

  it('off-rail: no roadmap node (orphan)', () => {
    const d = doc();
    const v = verdict(d, phase('captured'), 'design', /* hasNode */ false);
    expect(v.outcome).toBe('off-rail');
    expect(v.exitCode).toBe(VERDICT_EXIT['off-rail']);
    expect(v.exitCode).not.toBe(0);
    expect(v.reason).toMatch(/node/i);
  });

  it('off-rail: a terminal side-state refuses linear advancement', () => {
    const d = doc();
    const v = verdict(d, side('blocked'), 'design');
    expect(v.outcome).toBe('off-rail');
    expect(v.reason).toMatch(/blocked/i);
  });

  it('phase-neutral (session-end): on-course on any node, off-rail without a node', () => {
    const d = doc();
    expect(verdict(d, phase('implementing'), 'session-end').outcome).toBe('on-course');
    expect(verdict(d, phase('implementing'), 'session-end', false).outcome).toBe('off-rail');
  });

  it('the skippedStep ⇔ ahead invariant holds across the matrix (SC-001)', () => {
    const d = doc();
    const currents = ['planned', 'designing', 'specifying', 'implementing', 'governing'].map(phase);
    const intents = ['design', 'define', 'execute', 'govern', 'ship'];
    for (const c of currents) {
      for (const i of intents) {
        const v = verdict(d, c, i);
        expect(v.skippedStep !== null).toBe(v.outcome === 'ahead');
        expect(v.exitCode === 0).toBe(v.outcome === 'on-course' || v.outcome === 'behind');
      }
    }
  });

  it('is deterministic — identical inputs produce an identical verdict', () => {
    const d = doc();
    expect(verdict(d, phase('planned'), 'define')).toEqual(verdict(d, phase('planned'), 'define'));
  });
});
