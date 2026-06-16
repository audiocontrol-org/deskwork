// 024 US1 / FR-004 — the intent vocabulary is a FIXED enumeration of lifecycle
// skill/verb names, single-sourced by inverting each governed phase's `work:`
// skill (+ fixed transition aliases). An unknown intent fails loud (never silently
// on-course, never heuristically mapped). RED first (T015).

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import {
  buildIntentVocabulary,
  knownIntents,
  resolveIntent,
} from '../../workflow/intent-vocabulary.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function doc() {
  const f = makeWorkflowFixture();
  fixtures.push(f);
  return loadWorkflowDoc(f.root);
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

describe('024 FR-004 — intent vocabulary single-sourced from WORKFLOW.md work skills', () => {
  it('maps each work-bearing phase skill to its phase (the bundled lifecycle)', () => {
    const vocab = buildIntentVocabulary(doc());
    expect(vocab.get('design')).toBe('designing');
    expect(vocab.get('define')).toBe('specifying');
    expect(vocab.get('execute')).toBe('implementing'); // earliest phase wins over governing
    expect(vocab.get('backlog')).toBe('captured');
    expect(vocab.get('roadmap')).toBe('planned');
  });

  it('is total over the phases that declare a work skill', () => {
    const d = doc();
    const vocab = buildIntentVocabulary(d);
    const workBearing = d.phases.filter((p) => p.work !== '(none)' && p.work.length > 0);
    // every work-bearing phase id is reachable from at least one intent
    for (const p of workBearing) {
      expect([...vocab.values()]).toContain(p.id);
    }
  });

  it('includes the fixed transition aliases', () => {
    const r = (name: string) => resolveIntent(doc(), name);
    expect(r('govern')).toEqual({ kind: 'phase', phase: 'governing' });
    expect(r('ship')).toEqual({ kind: 'phase', phase: 'shipped' });
    expect(r('release')).toEqual({ kind: 'phase', phase: 'shipped' });
    expect(r('specify')).toEqual({ kind: 'phase', phase: 'specifying' });
    expect(r('speckit-implement')).toEqual({ kind: 'phase', phase: 'implementing' });
  });

  it('treats session-end as phase-neutral (a finishing skill)', () => {
    expect(resolveIntent(doc(), 'session-end')).toEqual({ kind: 'neutral', phase: null });
  });

  it('returns null for an unknown intent (the CLI turns this into a loud exit-2)', () => {
    expect(resolveIntent(doc(), 'frobnicate')).toBeNull();
  });

  it('knownIntents lists the recognized names (for the fail-loud message)', () => {
    const known = knownIntents(doc());
    expect(known).toContain('design');
    expect(known).toContain('govern');
    expect(known).toContain('session-end');
    expect(known).not.toContain('frobnicate');
  });
});
