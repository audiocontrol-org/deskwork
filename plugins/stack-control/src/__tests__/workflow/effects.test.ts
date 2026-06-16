// US4 (022) — the fixed 7-verb effect vocabulary: each verb dispatches, `commit`
// is engine-only, non-vocabulary + heavy/interactive verbs are rejected (FR-017/
// FR-018/FR-020). RED first (T019).

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyEffect,
  effectTouchedPath,
  validateEffect,
  type EffectContext,
} from '../../workflow/effects.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { loadWorkflowDoc, BUNDLED_WORKFLOW_PATH } from '../../workflow/workflow-grammar.js';
import { WorkflowError } from '../../workflow/workflow-types.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
function fixture(): WorkflowFixture {
  const f = makeWorkflowFixture([{ identifier: ITEM, status: 'planned' }]);
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function ctxFor(f: WorkflowFixture): EffectContext {
  return {
    installationRoot: f.root,
    roadmapPath: f.roadmapPath,
    journalPath: join(f.root, 'DEVELOPMENT-NOTES.md'),
    grammarOpts: f.opts,
    item: ITEM,
    bindings: { message: 'a journal line', status: 'in-flight' },
  };
}

function readItem(f: WorkflowFixture) {
  const model = loadRoadmap(f.roadmapPath, f.opts);
  return model.byId.get(ITEM)!;
}

describe('US4 effect vocabulary — each non-commit verb dispatches', () => {
  it('roadmap-advance changes the node status', () => {
    const f = fixture();
    applyEffect({ verb: 'roadmap-advance', args: { to: 'in-flight' } }, ctxFor(f));
    expect(readItem(f).status).toBe('in-flight');
  });

  it('workflow-link-design sets the design: pointer', () => {
    const f = fixture();
    applyEffect({ verb: 'workflow-link-design', args: { 'design-doc': 'docs/x-design.md' } }, ctxFor(f));
    expect(readItem(f).design).toBe('docs/x-design.md');
  });

  it('workflow-link-spec sets the spec: pointer', () => {
    const f = fixture();
    applyEffect({ verb: 'workflow-link-spec', args: { 'spec-dir': 'specs/022-x' } }, ctxFor(f));
    expect(readItem(f).spec).toBe('specs/022-x');
  });

  it('journal-append appends the resolved message (placeholder bound)', () => {
    const f = fixture();
    applyEffect({ verb: 'journal-append', args: { message: '{message}' } }, ctxFor(f));
    expect(readFileSync(join(f.root, 'DEVELOPMENT-NOTES.md'), 'utf8')).toContain('a journal line');
  });

  it('doc-set-status-field writes a frontmatter field', () => {
    const f = fixture();
    writeFileSync(join(f.root, 'note.md'), '# Note\nbody\n', 'utf8');
    applyEffect(
      { verb: 'doc-set-status-field', args: { path: 'note.md', field: 'status', value: 'Done' } },
      ctxFor(f),
    );
    expect(readFileSync(join(f.root, 'note.md'), 'utf8')).toContain('status: Done');
  });

  it('roadmap-reconcile is a no-op (report-only) and does not throw', () => {
    const f = fixture();
    expect(() => applyEffect({ verb: 'roadmap-reconcile', args: {} }, ctxFor(f))).not.toThrow();
  });
});

describe('US4 effect vocabulary — commit is engine-only and always last', () => {
  it('applyEffect refuses to fire commit (the engine fires it last)', () => {
    const f = fixture();
    expect(() => applyEffect({ verb: 'commit', args: { message: 'm' } }, ctxFor(f))).toThrow(WorkflowError);
  });

  it('every default transition that has a commit puts it last', () => {
    const f = fixture();
    const doc = loadWorkflowDoc(f.root);
    for (const t of doc.transitions) {
      const idx = t.effects.findIndex((e) => e.verb === 'commit');
      if (idx >= 0) expect(idx).toBe(t.effects.length - 1);
    }
  });
});

describe('US4 effect vocabulary — touched paths + validation', () => {
  it('reports the correct touched path per verb', () => {
    const f = fixture();
    const ctx = ctxFor(f);
    expect(effectTouchedPath({ verb: 'roadmap-advance', args: { to: 'x' } }, ctx)).toBe(f.roadmapPath);
    expect(effectTouchedPath({ verb: 'journal-append', args: { message: 'm' } }, ctx)).toBe(ctx.journalPath);
    expect(effectTouchedPath({ verb: 'roadmap-reconcile', args: {} }, ctx)).toBeNull();
    expect(effectTouchedPath({ verb: 'commit', args: { message: 'm' } }, ctx)).toBeNull();
  });

  it('validateEffect rejects a missing required arg', () => {
    const f = fixture();
    expect(() => validateEffect({ verb: 'roadmap-advance', args: {} }, ctxFor(f))).toThrow(/missing required arg 'to='/);
  });
});

describe('US4 effect vocabulary — non-vocabulary + heavy verbs rejected at parse (FR-017/FR-020)', () => {
  const BUNDLED = readFileSync(BUNDLED_WORKFLOW_PATH, 'utf8');
  function overrideWith(f: WorkflowFixture, content: string): void {
    writeFileSync(join(f.root, '.stack-control', 'WORKFLOW.md'), content, 'utf8');
  }
  it('rejects a non-vocabulary effect verb', () => {
    const f = fixture();
    overrideWith(f, BUNDLED.replace('- effects: roadmap-advance to=in-flight;', '- effects: not-a-verb;'));
    expect(() => loadWorkflowDoc(f.root)).toThrow(/unknown effect verb/);
  });
  it('rejects a heavy/interactive verb (execute) as an effect', () => {
    const f = fixture();
    overrideWith(f, BUNDLED.replace('- effects: roadmap-advance to=in-flight;', '- effects: govern;'));
    expect(() => loadWorkflowDoc(f.root)).toThrow(/heavy\/interactive verb/);
  });
});
