// T025 (031 US3, FR-014) — phase derivation maps a roadmap status that matches a
// phase id to THAT phase BY NAME, with no positional `phases[last]` assumption.
// With the terminal `closed` phase now last in WORKFLOW.md, a positional bug would
// mis-derive a `shipped` item to `closed`; a by-name rule never does. RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('031 T025 — phase derivation is by name, not positional', () => {
  it('maps status shipped → phase validating BY PREDICATE (status-is), not positionally to closed (032)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    // 032: there is no `phase:shipped`. `status: shipped` derives `validating` via the
    // `status-is shipped` predicate. The last phase is `closed`; a positional `phases[last]`
    // rule would mis-derive to closed — the predicate yields validating.
    const r = derivePhase(
      doc,
      base({ status: 'shipped', specPointer: 's', analyzeClean: true, tasksComplete: true, implRecordConverged: false }),
    );
    expect(r).toEqual({ kind: 'phase', id: 'validating' });
  });

  it('maps status closed → phase closed BY NAME', () => {
    const doc = loadWorkflowDoc(fixture().root);
    const r = derivePhase(
      doc,
      base({ status: 'closed', specPointer: 's', analyzeClean: true, tasksComplete: true, implRecordConverged: false }),
    );
    expect(r).toEqual({ kind: 'phase', id: 'closed' });
  });

  it('closed is the by-name terminal (last phase); a shipped-status item derives validating, never positionally closed', () => {
    const doc = loadWorkflowDoc(fixture().root);
    expect(doc.phases[doc.phases.length - 1]!.id).toBe('closed');
    const shipped = derivePhase(doc, base({ status: 'shipped' }));
    const closed = derivePhase(doc, base({ status: 'closed' }));
    expect(shipped).toEqual({ kind: 'phase', id: 'validating' });
    expect(closed).toEqual({ kind: 'phase', id: 'closed' });
    expect(shipped).not.toEqual(closed);
  });

  it('a non-terminal status that happens NOT to name a phase still derives by predicate (no by-name short-circuit)', () => {
    const doc = loadWorkflowDoc(fixture().root);
    // status `in-flight` does not match any phase id; derivation falls to the
    // predicate chain — analyze-clean recorded ⇒ implementing.
    const r = derivePhase(doc, base({ status: 'in-flight', specPointer: 's', analyzeClean: true }));
    expect(r).toEqual({ kind: 'phase', id: 'implementing' });
  });

  it('a status that names an ACTIVE (work-bearing) phase still derives by predicate, NOT by name', () => {
    const doc = loadWorkflowDoc(fixture().root);
    // `planned` is both a valid status AND a phase id, but it is a WORK-BEARING
    // phase, not a recorded terminal. An item recorded `planned` whose artifacts
    // have advanced (design+spec+analyze-clean) derives to the predicate phase
    // (implementing), NOT short-circuited to `planned` by name — the by-name rule
    // applies only to the post-graduation, work-less terminal phases.
    const r = derivePhase(doc, base({ status: 'planned', specPointer: 's', analyzeClean: true }));
    expect(r).toEqual({ kind: 'phase', id: 'implementing' });
  });

  it('the by-name terminal rule is GENERAL — it is not hardcoded to shipped/closed', () => {
    // A custom WORKFLOW.md override whose terminal phase is named `archived`
    // (work: (none)) must derive a status `archived` to phase `archived` BY NAME.
    // The pre-generalization code hardcoded `status === 'shipped' || 'closed'`, so
    // it would mis-derive `archived` through the predicate chain instead.
    const f = fixture();
    writeFileSync(join(f.root, '.stack-control', 'WORKFLOW.md'), CUSTOM_WORKFLOW, 'utf8');
    const doc = loadWorkflowDoc(f.root);
    expect(doc.phases[doc.phases.length - 1]!.id).toBe('archived');
    const r = derivePhase(
      doc,
      base({ status: 'archived', specPointer: 's', analyzeClean: true, tasksComplete: true }),
    );
    expect(r).toEqual({ kind: 'phase', id: 'archived' });
  });
});

// A minimal override lifecycle whose post-graduation terminal phase is `archived`
// (work: (none)) — proves the by-name terminal rule is general, not a fixed
// shipped/closed enumeration.
const CUSTOM_WORKFLOW = [
  '---',
  'doc-grammar: workflow',
  '---',
  '',
  '# custom lifecycle',
  '',
  '## phase:planned',
  '',
  '- status: active',
  '- kind: phase',
  '- derive: node-present',
  '- work: stack-control:roadmap',
  '- entrance: (none)',
  '- exit: (none)',
  '- next: implementing',
  '',
  '## phase:implementing',
  '',
  '- status: active',
  '- kind: phase',
  '- derive: node-marker analyze-clean',
  '- work: stack-control:execute',
  '- entrance: (none)',
  '- exit: (none)',
  '- next: archived',
  '',
  '## phase:archived',
  '',
  '- status: active',
  '- kind: phase',
  '- derive: release-tagged',
  '- work: (none)',
  '- entrance: (none)',
  '- exit: (none)',
  '- next: (none)',
  '',
].join('\n');
