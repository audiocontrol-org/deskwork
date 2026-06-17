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

const hasCriterion = (criteria: readonly { kind: string; target: string }[]): boolean =>
  criteria.some((c) => c.kind === 'all-phase-checkpoints-current' && c.target === 'impl');

describe('WORKFLOW.md grammar — all-phase-checkpoints-current (025 US1)', () => {
  it('registers the criterion kind', () => {
    expect(CRITERION_KINDS).toContain('all-phase-checkpoints-current');
  });

  it('the bundled graduate transition gate requires all-phase-checkpoints-current impl', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const graduate = doc.transitions.find((t) => t.codename === 'graduate');
    expect(graduate).toBeDefined();
    expect(hasCriterion(graduate!.exitGate)).toBe(true);
  });

  it('the bundled start-governing transition gate requires all-phase-checkpoints-current impl', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const startGoverning = doc.transitions.find((t) => t.codename === 'start-governing');
    expect(startGoverning).toBeDefined();
    expect(hasCriterion(startGoverning!.exitGate)).toBe(true);
  });
});
