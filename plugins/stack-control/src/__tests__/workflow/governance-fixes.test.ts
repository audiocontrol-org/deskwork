// Governance pass (022 after_implement) — fixes for the cross-model audit-barrage
// findings. RED first. Each test traces to a finding that ≥2 model lanes agreed on
// (the HIGH-confidence signal) or a clear fail-loud gap.

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { anchorWithin } from '../../workflow/anchor.js';
import { evaluateCriterion, type GateContext } from '../../workflow/gate-eval.js';
import { applyEffect, type EffectContext } from '../../workflow/effects.js';
import { readGovernConvergenceRecord, writeGovernConvergenceRecord } from '../../govern/convergence-record.js';
import { WorkflowError } from '../../workflow/workflow-types.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(nodes: Parameters<typeof makeWorkflowFixture>[0] = []): WorkflowFixture {
  const f = makeWorkflowFixture(nodes);
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

describe('finding F1 (HIGH, cross-model) — authored paths must stay inside the installation', () => {
  it('anchorWithin accepts install-relative paths', () => {
    const f = fixture();
    expect(anchorWithin(f.root, 'docs/x-design.md')).toBe(join(f.root, 'docs/x-design.md'));
  });

  it('anchorWithin rejects an absolute path outside the installation', () => {
    const f = fixture();
    expect(() => anchorWithin(f.root, '/etc/passwd')).toThrow(WorkflowError);
    expect(() => anchorWithin(f.root, '/etc/passwd')).toThrow(/escapes the installation root/);
  });

  it('anchorWithin rejects a relative path that escapes via ..', () => {
    const f = fixture();
    expect(() => anchorWithin(f.root, '../../outside.md')).toThrow(/escapes the installation root/);
    expect(() => anchorWithin(f.root, 'docs/../../../outside.md')).toThrow(/escapes the installation root/);
  });

  it('doc-set-status-field refuses an escaping path effect (FR-030)', () => {
    const f = fixture([{ identifier: 'multi:feature/x', status: 'planned' }]);
    const ctx: EffectContext = {
      installationRoot: f.root,
      roadmapPath: f.roadmapPath,
      journalPath: join(f.root, 'J.md'),
      grammarOpts: f.opts,
      item: 'multi:feature/x',
      bindings: {},
    };
    expect(() =>
      applyEffect({ verb: 'doc-set-status-field', args: { path: '/tmp/evil.md', field: 'x', value: 'y' } }, ctx),
    ).toThrow(/escapes the installation root/);
  });
});

describe('finding F3 (MEDIUM, cross-model) — anchorRoot must be validated against the installation', () => {
  it('a record whose anchorRoot is a different installation is rejected', () => {
    const f = fixture();
    const other = fixture();
    // Write a record stamped with f.root, then read it as if from `other` — reject.
    writeGovernConvergenceRecord(f.root, {
      version: 1,
      mode: 'impl',
      item: '022-x',
      scopeFingerprint: 'abc',
      converged: true,
      recordedAt: '2026-06-16T00:00:00Z',
    });
    // Copy the record file into `other`'s convergence dir (a stale/copied record).
    const body = `{
  "version": 1, "mode": "impl", "item": "022-x", "scopeFingerprint": "abc",
  "converged": true, "recordedAt": "2026-06-16T00:00:00Z", "anchorRoot": "${f.root}"
}`;
    other.write('.stack-control/govern/convergence/impl__022-x.json', body);
    expect(() => readGovernConvergenceRecord(other.root, 'impl', '022-x')).toThrow(/anchorRoot/);
  });
});

describe('finding M (MEDIUM) — gate criteria validate their target (fail loud, FR-007/FR-008)', () => {
  function ctx(f: WorkflowFixture): GateContext {
    return {
      installationRoot: f.root,
      item: 'x',
      designPointer: null,
      specPointer: null,
      analyzeClean: false,
      designApproved: false,
      designRecordPath: null,
      specDirPath: null,
      implRecordConverged: false,
      specRecordConverged: false,
      advanceTreeClean: true,
    };
  }
  it('section-present rejects a non-design target instead of silently checking the design record', () => {
    const f = fixture();
    expect(() =>
      evaluateCriterion({ kind: 'section-present', target: 'spec', param: 'problem-domain' }, ctx(f)),
    ).toThrow(WorkflowError);
  });
  it('tree-clean rejects a non-advance target', () => {
    const f = fixture();
    expect(() => evaluateCriterion({ kind: 'tree-clean', target: 'repo' }, ctx(f))).toThrow(WorkflowError);
  });
});
