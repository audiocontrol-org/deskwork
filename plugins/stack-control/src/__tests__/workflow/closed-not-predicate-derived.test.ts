// AUDIT-20260623-03 (RED-first, 031) — the terminal `closed` phase MUST NOT be
// reachable by the artifact predicate loop. Closing is an explicit operator-
// confirmed action recorded as `status: closed` (handled by the by-name rule
// BEFORE the loop) — there is no artifact that means "closed". `phase:closed`
// originally carried `derive: release-tagged`, and since `closed` is the LAST
// phase the loop scans first, a release-tagged item whose status does NOT name a
// work-less phase (e.g. `in-flight` with a manual release tag) mis-derived to
// `closed` — implying the cascade ran when it never did. `closed` must derive
// ONLY by-name; `shipped` must still derive from its convergence record.

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { derivePhase, type DerivationInputs } from '../../workflow/phase-derivation.js';
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

function base(overrides: Partial<DerivationInputs> = {}): DerivationInputs {
  return {
    hasNode: true,
    inBacklog: false,
    status: 'in-flight',
    designPointer: null,
    specPointer: null,
    analyzeClean: false,
    designApproved: false,
    tasksComplete: false,
    implRecordConverged: false,
    specRecordConverged: false,
    releaseTagged: false,
    blocked: false,
    ...overrides,
  };
}

describe('closed is not predicate-derived (AUDIT-20260623-03)', () => {
  it('a release-tagged item with a non-closed status does NOT derive closed', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(
      doc,
      base({
        status: 'in-flight',
        releaseTagged: true,
        designPointer: 'd',
        specPointer: 's',
        analyzeClean: true,
        tasksComplete: true,
        implRecordConverged: true,
      }),
    );
    expect(r.id).not.toBe('closed');
    expect(r).toEqual({ kind: 'phase', id: 'shipped' }); // its real artifact phase
  });

  it('a release-tagged item with NO convergence record still does not derive closed', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(doc, base({ status: 'in-flight', releaseTagged: true }));
    expect(r.id).not.toBe('closed');
  });

  it('status closed still derives the closed phase BY NAME (unchanged)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    expect(derivePhase(doc, base({ status: 'closed' }))).toEqual({ kind: 'phase', id: 'closed' });
  });
});
