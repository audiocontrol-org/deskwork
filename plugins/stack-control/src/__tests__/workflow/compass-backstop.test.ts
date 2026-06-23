// 032 US3 (T018) — the backstop compass invariant. `computeVerdict` gains
// `danglingMergedItem` (the id of a merged-but-status-in-flight item found over the
// roadmap). While one dangles, forward lifecycle motion for ANY OTHER item is refused
// (off-rail class, non-zero exit), naming the dangling item + the reconcile command.
// EXEMPTION (FR-010): consulting the compass FOR the dangling item itself is allowed —
// the reconcile (advancing it to shipped) must never be blocked. On-course when none
// dangles. RED first.

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
const DANGLING = 'multi:feature/dangling';
const OTHER = 'multi:feature/other';

describe('032 US3 — backstop compass invariant (T018)', () => {
  it('refuses forward motion for ANOTHER item while one dangles, naming it + the reconcile command', () => {
    const d = doc();
    const v = computeVerdict({
      doc: d,
      currentPhase: phase('planned'),
      intent: resolveIntent(d, 'design')!,
      hasNode: true,
      intentItem: OTHER,
      danglingMergedItem: DANGLING,
    });
    expect(v.outcome).toBe('off-rail');
    expect(v.exitCode).not.toBe(0);
    expect(v.reason).toContain(DANGLING);
    expect(v.reason).toMatch(/reconcile|advance/i); // names the recovery command
  });

  it('ALLOWS the dangling item its own reconcile (ship → merging, at-or-before current)', () => {
    const d = doc();
    // the dangling item derives merging (govern-converged, in-flight); ship is its reconcile move
    const v = computeVerdict({
      doc: d,
      currentPhase: phase('merging'),
      intent: resolveIntent(d, 'ship')!,
      hasNode: true,
      intentItem: DANGLING,
      danglingMergedItem: DANGLING,
    });
    expect(v.outcome).not.toBe('off-rail'); // backstop does NOT fire for the reconcile
    expect(v.exitCode).toBe(0); // ship from merging is behind/on-course — allowed
  });

  it('REFUSES a FORWARD intent on the dangling item (release → validating) — only the reconcile is exempt (AUDIT-20260623-02)', () => {
    const d = doc();
    // release maps to validating (one phase PAST merging). Exempting it would let an off-rail
    // merged item into the release skill before its status is recorded — the exemption must be
    // limited to the reconcile (at-or-before-current), not any intent for the dangling item.
    const v = computeVerdict({
      doc: d,
      currentPhase: phase('merging'),
      intent: resolveIntent(d, 'release')!,
      hasNode: true,
      intentItem: DANGLING,
      danglingMergedItem: DANGLING,
    });
    expect(v.outcome).toBe('off-rail'); // forward motion on the dangling item is still blocked
    expect(v.exitCode).not.toBe(0);
    expect(v.reason).toContain(DANGLING);
  });

  it('does NOT block a phase-neutral finishing intent (session-end) even with a dangling item (session-skills-never-block)', () => {
    const d = doc();
    const v = computeVerdict({
      doc: d,
      currentPhase: phase('implementing'),
      intent: resolveIntent(d, 'session-end')!,
      hasNode: true,
      intentItem: OTHER,
      danglingMergedItem: DANGLING,
    });
    expect(v.outcome).not.toBe('off-rail'); // session-end is never backstop-refused
    expect(v.exitCode).toBe(0);
  });

  it('on-course when no item dangles (backstop dormant)', () => {
    const d = doc();
    const v = computeVerdict({
      doc: d,
      currentPhase: phase('planned'),
      intent: resolveIntent(d, 'design')!,
      hasNode: true,
      intentItem: OTHER,
      danglingMergedItem: null,
    });
    expect(v.outcome).toBe('on-course');
    expect(v.exitCode).toBe(0);
  });
});
