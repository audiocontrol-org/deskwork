// US1 (022) — criterion predicates evaluate to definite true/false, unmet
// enumeration reports M of N, and the judgment criterion reads the recorded
// node marker (never a subjective evaluation). RED first (T011).

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  classifyTasks,
  evaluateCriterion,
  evaluateGate,
  type GateContext,
} from '../../workflow/gate-eval.js';
import type { Criterion } from '../../workflow/workflow-types.js';
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

const FULL_DESIGN_RECORD = [
  '# Design record',
  '',
  '## problem-domain',
  'the problem.',
  '',
  '## solution-space',
  '- Alternative A (rejected): reason.',
  '- Alternative B (chosen): reason.',
  '',
  '## decisions',
  'we chose B.',
  '',
  '## open-questions',
  'none.',
  '',
  '## provenance',
  'from the design session.',
  '',
].join('\n');

function ctxFor(f: WorkflowFixture, overrides: Partial<GateContext> = {}): GateContext {
  return {
    installationRoot: f.root,
    item: 'multi:feature/x',
    designPointer: null,
    specPointer: null,
    analyzeClean: false,
    designApproved: false,
    designRecordPath: null,
    specDirPath: null,
    implRecordConverged: false,
    specRecordConverged: false,
    advanceTreeClean: true,
    ...overrides,
  };
}

describe('US1 criterion evaluation — each kind → definite true/false', () => {
  it('pointer-set reads whether the node pointer is set', () => {
    const f = fixture();
    const c: Criterion = { kind: 'pointer-set', target: 'spec' };
    expect(evaluateCriterion(c, ctxFor(f, { specPointer: null }))).toBe(false);
    expect(evaluateCriterion(c, ctxFor(f, { specPointer: 'specs/022-x' }))).toBe(true);
  });

  it('node-marker reads the recorded analyze-clean fact (not a judgment)', () => {
    const f = fixture();
    const c: Criterion = { kind: 'node-marker', target: 'analyze-clean' };
    expect(evaluateCriterion(c, ctxFor(f, { analyzeClean: false }))).toBe(false);
    expect(evaluateCriterion(c, ctxFor(f, { analyzeClean: true }))).toBe(true);
  });

  it('approval-marker reads the recorded design-approved node field', () => {
    const f = fixture();
    const c: Criterion = { kind: 'approval-marker', target: 'design-approved' };
    expect(evaluateCriterion(c, ctxFor(f, { designApproved: false }))).toBe(false);
    expect(evaluateCriterion(c, ctxFor(f, { designApproved: true }))).toBe(true);
  });

  it('record-converged reads the impl convergence fact', () => {
    const f = fixture();
    const c: Criterion = { kind: 'record-converged', target: 'impl' };
    expect(evaluateCriterion(c, ctxFor(f, { implRecordConverged: false }))).toBe(false);
    expect(evaluateCriterion(c, ctxFor(f, { implRecordConverged: true }))).toBe(true);
  });

  it('tasks-complete reads tasks.md checkbox completion under the spec dir', () => {
    const f = fixture();
    f.writeSpecTasks('specs/022-x', false);
    const incomplete = ctxFor(f, { specPointer: 'specs/022-x', specDirPath: join(f.root, 'specs/022-x') });
    expect(evaluateCriterion({ kind: 'tasks-complete', target: 'spec' }, incomplete)).toBe(false);
    f.writeSpecTasks('specs/022-x', true);
    expect(evaluateCriterion({ kind: 'tasks-complete', target: 'spec' }, incomplete)).toBe(true);
  });

  // gh-499 / gh-501 (TASK-451): the tasks-complete gate must EXCLUDE manual /
  // operator-acceptance tasks so the cross-model audit runs BEFORE the operator
  // spends a live-prod acceptance. The `[~]` (and `[-]`) markers are the
  // first-class, documented way to mark such a task — and the exclusion must be
  // intentional, not an accident of a narrow regex.
  describe('manual-acceptance marker (gh-499/gh-501)', () => {
    it('classifyTasks splits gateable / done / manual', () => {
      const t = classifyTasks(
        ['- [x] T001 code', '- [X] T002 code', '- [ ] T003 code', '- [~] T004 [manual] operator re-bless', '- [-] T005 deferred'].join(
          '\n',
        ),
      );
      expect(t).toEqual({ gateable: 3, done: 2, manual: 2 });
    });

    it('a manual [~] task does not block once every code task is done', () => {
      const f = fixture();
      f.write('specs/007-x/tasks.md', ['# Tasks', '', '- [x] T001 code', '- [x] T002 code', '- [~] T015 [manual] operator live re-bless', ''].join('\n'));
      const ctx = ctxFor(f, { specPointer: 'specs/007-x', specDirPath: join(f.root, 'specs/007-x') });
      expect(evaluateCriterion({ kind: 'tasks-complete', target: 'spec' }, ctx)).toBe(true);
    });

    it('a plain [ ] task still blocks (the marker is the explicit opt-out)', () => {
      const f = fixture();
      f.write('specs/007-y/tasks.md', ['# Tasks', '', '- [x] T001 code', '- [ ] T015 operator live re-bless', ''].join('\n'));
      const ctx = ctxFor(f, { specPointer: 'specs/007-y', specDirPath: join(f.root, 'specs/007-y') });
      expect(evaluateCriterion({ kind: 'tasks-complete', target: 'spec' }, ctx)).toBe(false);
    });

    it('an unrecognized checkbox marker is NOT silently excluded (no-silent-caps)', () => {
      const f = fixture();
      // A typo'd `[?]` must count as an open gateable task — never silently drop
      // out of the count and let an unfinished task satisfy the gate.
      f.write('specs/007-z/tasks.md', ['# Tasks', '', '- [x] T001 code', '- [?] T002 typo', ''].join('\n'));
      const ctx = ctxFor(f, { specPointer: 'specs/007-z', specDirPath: join(f.root, 'specs/007-z') });
      expect(evaluateCriterion({ kind: 'tasks-complete', target: 'spec' }, ctx)).toBe(false);
    });
  });

  it('section-present finds a required design-record heading', () => {
    const f = fixture();
    const path = f.write('docs/superpowers/specs/x-design.md', FULL_DESIGN_RECORD);
    const c = ctxFor(f, { designRecordPath: path });
    expect(evaluateCriterion({ kind: 'section-present', target: 'design', param: 'problem-domain' }, c)).toBe(true);
    expect(evaluateCriterion({ kind: 'section-present', target: 'design', param: 'provenance' }, c)).toBe(true);
    expect(evaluateCriterion({ kind: 'section-present', target: 'design', param: 'missing-section' }, c)).toBe(false);
  });

  it('count-gte counts solution-space alternatives against a threshold', () => {
    const f = fixture();
    const path = f.write('docs/superpowers/specs/x-design.md', FULL_DESIGN_RECORD);
    const c = ctxFor(f, { designRecordPath: path });
    expect(evaluateCriterion({ kind: 'count-gte', target: 'solution-space-alternatives', param: 2 }, c)).toBe(true);
    expect(evaluateCriterion({ kind: 'count-gte', target: 'solution-space-alternatives', param: 3 }, c)).toBe(false);
  });

  it('file-exists reads whether the resolved artifact exists', () => {
    const f = fixture();
    const path = f.write('docs/superpowers/specs/x-design.md', FULL_DESIGN_RECORD);
    expect(evaluateCriterion({ kind: 'file-exists', target: 'design' }, ctxFor(f, { designRecordPath: path }))).toBe(true);
    expect(
      evaluateCriterion({ kind: 'file-exists', target: 'design' }, ctxFor(f, { designRecordPath: join(f.root, 'nope.md') })),
    ).toBe(false);
  });

  it('tree-clean reads the advance-tree-clean context flag', () => {
    const f = fixture();
    expect(evaluateCriterion({ kind: 'tree-clean', target: 'advance' }, ctxFor(f, { advanceTreeClean: true }))).toBe(true);
    expect(evaluateCriterion({ kind: 'tree-clean', target: 'advance' }, ctxFor(f, { advanceTreeClean: false }))).toBe(false);
  });
});

describe('US1 unmet enumeration — M of N', () => {
  it('reports the exact unmet criteria and met count', () => {
    const f = fixture();
    const path = f.write('docs/superpowers/specs/x-design.md', FULL_DESIGN_RECORD);
    const criteria: Criterion[] = [
      { kind: 'section-present', target: 'design', param: 'problem-domain' }, // met
      { kind: 'count-gte', target: 'solution-space-alternatives', param: 2 }, // met
      { kind: 'approval-marker', target: 'design-approved' }, // unmet (not approved)
    ];
    const result = evaluateGate(criteria, ctxFor(f, { designRecordPath: path, designApproved: false }));
    expect(result.allMet).toBe(false);
    expect(result.met.length).toBe(2);
    expect(result.unmet.length).toBe(1);
    expect(result.unmet[0]!.kind).toBe('approval-marker');
  });

  it('an empty criterion list is all-met (a phase with no exit gate)', () => {
    const f = fixture();
    const result = evaluateGate([], ctxFor(f));
    expect(result.allMet).toBe(true);
    expect(result.unmet.length).toBe(0);
  });
});
