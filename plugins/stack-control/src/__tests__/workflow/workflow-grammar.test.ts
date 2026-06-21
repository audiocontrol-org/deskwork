// 025 US1 (T011) — the WORKFLOW.md grammar accepts the new
// `all-phase-checkpoints-current` criterion kind, and the bundled default wires it
// onto the graduate (governing→shipped) and start-governing (implementing→governing)
// exit gates (FR-001/FR-002/FR-005). RED first (the kind did not exist).

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { CRITERION_KINDS } from '../../workflow/workflow-types.js';
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

const hasKind = (criteria: readonly { kind: string; target: string }[], kind: string): boolean =>
  criteria.some((c) => c.kind === kind);
function defined<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a defined value');
  return v;
}

describe('030 US2 — WORKFLOW.md grammar: single graduate criterion (FR-018, clean break)', () => {
  it('does NOT register the deleted per-phase criterion; registers graduate-impl', () => {
    expect(CRITERION_KINDS).not.toContain('all-phase-checkpoints-current');
    expect(CRITERION_KINDS).toContain('graduate-impl');
  });

  it('the bundled graduate transition gate requires the graduate-impl criterion', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const graduate = defined(doc.transitions.find((t) => t.codename === 'graduate'));
    expect(hasKind(graduate.exitGate, 'graduate-impl')).toBe(true);
  });

  it('the start-governing gate is tasks-complete only — no per-phase criterion', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const startGoverning = defined(doc.transitions.find((t) => t.codename === 'start-governing'));
    expect(hasKind(startGoverning.exitGate, 'tasks-complete')).toBe(true);
    expect(hasKind(startGoverning.exitGate, 'all-phase-checkpoints-current')).toBe(false);
  });
});
