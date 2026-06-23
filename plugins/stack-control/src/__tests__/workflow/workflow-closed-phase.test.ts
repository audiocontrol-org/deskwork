// T008 (RED-first, Foundational, 031) — the bundled WORKFLOW.md defines a new
// terminal phase `closed` AFTER `shipped` (no outgoing `next`), and a
// `shipped → closed` transition (FR-012). `shipped` itself is no longer terminal:
// its `next` now points at `closed` (the "don't forget to close" surface).

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
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

describe('WORKFLOW.md `closed` terminal phase (T008, FR-012; 032 ship-stage)', () => {
  it('defines phase:closed after phase:validating (032: shipped is a status, not a phase)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const ids = doc.phases.map((p) => p.id);
    expect(ids).toContain('closed');
    expect(ids).toContain('validating');
    expect(ids).not.toContain('shipped');
    expect(ids.indexOf('closed')).toBeGreaterThan(ids.indexOf('validating'));
  });

  it('closed is terminal (no outgoing next)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const closed = doc.phases.find((p) => p.id === 'closed');
    expect(closed).toBeDefined();
    expect(closed!.next).toBeNull();
  });

  it('validating is no longer terminal — its next is closed', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const validating = doc.phases.find((p) => p.id === 'validating');
    expect(validating).toBeDefined();
    expect(validating!.next).toBe('closed');
  });

  it('a validating → closed transition exists (the close gate)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const t = doc.transitions.find((x) => x.from === 'validating' && x.to === 'closed');
    expect(t).toBeDefined();
  });
});
