// T031 (031 US3, FR-013) — a `shipped` item is NOT yet terminal: the workflow
// status / next surface reports `closed` as the legitimate pending next move (the
// "don't forget to close" surface). Pure check on legitimateNextPhase + the CLI
// surfaces. RED first — drives the real CLI via runCli (mirrors query-verbs.test).

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { legitimateNextPhase } from '../../workflow/compass.js';
import { runCli } from '../_run-helpers.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

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

describe('031 T031 — a shipped item is not terminal; closed is the pending next move (FR-013)', () => {
  it('legitimateNextPhase(shipped) === closed (the generic engine surfaces the pending close)', () => {
    const doc = loadWorkflowDoc(fixture([]).root);
    expect(legitimateNextPhase(doc, 'shipped')).toBe('closed');
    expect(legitimateNextPhase(doc, 'closed')).toBeNull(); // closed IS terminal
  });

  it('workflow next on a shipped item names the close transition toward closed', () => {
    const f = fixture([{ identifier: ITEM, status: 'shipped' }]);
    const r = runCli(['workflow', 'next', ITEM], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('current phase: shipped');
    // NOT terminal: a forward transition toward closed is named.
    expect(r.stdout).not.toMatch(/no further transition/i);
    expect(r.stdout).toMatch(/next transition: close/i);
    expect(r.stdout).toContain('closed');
  });

  it('workflow status on a shipped item surfaces the pending closed move', () => {
    const f = fixture([{ identifier: ITEM, status: 'shipped' }]);
    const r = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('phase: shipped');
    // The pending-close surface: the status names `closed` as the legitimate next move.
    expect(r.stdout).toContain('closed');
  });
});
