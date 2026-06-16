// US2 (022) — phase derivation is total, deterministic, and keyed on the
// `design:` pointer (not file existence). RED first (T008): exercises the pure
// `derivePhase(doc, inputs)` against the bundled lifecycle.

import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import {
  derivePhase,
  type DerivationInputs,
} from '../../workflow/phase-derivation.js';
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

/** A baseline inputs object (a node present, nothing else set). */
function base(overrides: Partial<DerivationInputs> = {}): DerivationInputs {
  return {
    hasNode: true,
    inBacklog: false,
    status: 'planned',
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

describe('US2 phase derivation — totality + determinism', () => {
  it('derives captured for a backlog-only item with no roadmap node', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(doc, base({ hasNode: false, inBacklog: true, status: null }));
    expect(r).toEqual({ kind: 'phase', id: 'captured' });
  });

  it('derives planned for a node with no design pointer', () => {
    const doc = loadWorkflowDoc(fixture().root);
    expect(derivePhase(doc, base())).toEqual({ kind: 'phase', id: 'planned' });
  });

  it('derives designing keyed on the design: pointer, NOT on the design file existing', () => {
    const doc = loadWorkflowDoc(fixture().root);
    // design pointer set, spec absent — the design file need not exist on disk.
    const r = derivePhase(doc, base({ designPointer: 'docs/superpowers/specs/x-design.md' }));
    expect(r).toEqual({ kind: 'phase', id: 'designing' });
  });

  it('derives specifying for a spec pointer set but not analyze-clean', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(
      doc,
      base({ designPointer: 'd', specPointer: 'specs/022-x', analyzeClean: false }),
    );
    expect(r).toEqual({ kind: 'phase', id: 'specifying' });
  });

  it('derives implementing once analyze-clean is recorded and tasks are not complete', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(
      doc,
      base({ designPointer: 'd', specPointer: 's', analyzeClean: true, tasksComplete: false }),
    );
    expect(r).toEqual({ kind: 'phase', id: 'implementing' });
  });

  it('derives governing when tasks.md is 100% with no impl convergence record (US2.3)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(
      doc,
      base({
        designPointer: 'd',
        specPointer: 's',
        analyzeClean: true,
        tasksComplete: true,
        implRecordConverged: false,
      }),
    );
    expect(r).toEqual({ kind: 'phase', id: 'governing' });
  });

  it('derives shipped only when the impl convergence record is recorded and converged', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(
      doc,
      base({
        designPointer: 'd',
        specPointer: 's',
        analyzeClean: true,
        tasksComplete: true,
        implRecordConverged: true,
      }),
    );
    expect(r).toEqual({ kind: 'phase', id: 'shipped' });
  });

  it('is total — every input shape maps to exactly one phase or side-state', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const cases: DerivationInputs[] = [
      base({ hasNode: false, inBacklog: true }),
      base(),
      base({ designPointer: 'd' }),
      base({ designPointer: 'd', specPointer: 's' }),
      base({ designPointer: 'd', specPointer: 's', analyzeClean: true }),
      base({ designPointer: 'd', specPointer: 's', analyzeClean: true, tasksComplete: true }),
      base({ implRecordConverged: true, tasksComplete: true, analyzeClean: true }),
      base({ status: 'cancelled' }),
      base({ status: 'retired' }),
      base({ blocked: true }),
    ];
    for (const inputs of cases) {
      const r = derivePhase(doc, inputs);
      expect(r.kind === 'phase' || r.kind === 'side-state').toBe(true);
      expect(typeof r.id).toBe('string');
      expect(r.id.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic — identical inputs produce identical phase', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const inputs = base({ designPointer: 'd', specPointer: 's', analyzeClean: true });
    expect(derivePhase(doc, inputs)).toEqual(derivePhase(doc, inputs));
  });
});

describe('US2 terminal side-states (T010)', () => {
  it('derives cancelled / retired from node status, ahead of any pipeline phase', () => {
    const doc = loadWorkflowDoc(fixture().root);
    expect(derivePhase(doc, base({ status: 'cancelled', specPointer: 's' }))).toEqual({
      kind: 'side-state',
      id: 'cancelled',
    });
    expect(derivePhase(doc, base({ status: 'retired', specPointer: 's' }))).toEqual({
      kind: 'side-state',
      id: 'retired',
    });
  });

  it('derives blocked from the blocked flag, ahead of any pipeline phase', () => {
    const doc = loadWorkflowDoc(fixture().root);
    expect(
      derivePhase(doc, base({ blocked: true, specPointer: 's', analyzeClean: true })),
    ).toEqual({ kind: 'side-state', id: 'blocked' });
  });
});
