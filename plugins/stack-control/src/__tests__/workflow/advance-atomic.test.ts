// US4 (022) — `advance --apply` is atomic: success → all effects in one trailing
// commit; a fault before the commit → touched paths restored, nothing committed; a
// dirty advance-touched tree → refuse loud (FR-016, SC-004). RED first (T018);
// drives the transition engine directly so a fault can be injected at each position.

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyTransition, previewTransition } from '../../workflow/transition-engine.js';
import type { EffectContext } from '../../workflow/effects.js';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { WorkflowError, type Transition } from '../../workflow/workflow-types.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';

/** A git-backed fixture with one planned node, roadmap committed (clean tree). */
function gitFixture(): WorkflowFixture {
  const f = makeWorkflowFixture([{ identifier: ITEM, status: 'planned' }], { git: true });
  fixtures.push(f);
  f.commitAll('seed');
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
    bindings: { message: 'advance message' },
  };
}

/** The open-design transition (planned → designing): roadmap-advance; journal-append; commit. */
function openDesign(f: WorkflowFixture): Transition {
  const doc = loadWorkflowDoc(f.root);
  const t = doc.transitions.find((x) => x.codename === 'open-design');
  if (t === undefined) throw new Error('open-design transition missing');
  return t;
}

function head(f: WorkflowFixture): string {
  return f.git(['rev-parse', 'HEAD']).trim();
}
function status(f: WorkflowFixture): string {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.status;
}

describe('US4 atomic advance — success path', () => {
  it('applies all effects and captures them in a single trailing commit', () => {
    const f = gitFixture();
    const before = head(f);
    const out = applyTransition(openDesign(f), ctxFor(f));
    expect(out.committed).toBe(true);
    expect(status(f)).toBe('in-flight'); // roadmap-advance fired
    expect(existsSync(join(f.root, 'DEVELOPMENT-NOTES.md'))).toBe(true); // journal-append fired
    // exactly one new commit, working tree clean
    expect(head(f)).not.toBe(before);
    expect(f.git(['rev-list', '--count', `${before}..HEAD`]).trim()).toBe('1');
    expect(f.git(['status', '--porcelain']).trim()).toBe('');
  });

  it('dry-run previews the ordered effects and writes nothing', () => {
    const f = gitFixture();
    const before = head(f);
    const preview = previewTransition(openDesign(f), ctxFor(f));
    expect(preview.applied).toBe(false);
    expect(preview.effects.map((e) => e.verb)).toEqual(['roadmap-advance', 'journal-append', 'commit']);
    expect(status(f)).toBe('planned'); // unchanged
    expect(head(f)).toBe(before);
  });
});

describe('US4 atomic advance — fault injection at each effect position', () => {
  it('restores the touched paths and commits nothing on a fault at any position', () => {
    const t0 = makeWorkflowFixture([{ identifier: ITEM, status: 'planned' }], { git: true });
    fixtures.push(t0);
    t0.commitAll('seed');
    const nonCommit = openDesign(t0).effects.filter((e) => e.verb !== 'commit').length;

    for (let pos = 0; pos < nonCommit; pos++) {
      const f = gitFixture();
      const roadmapBefore = readFileSync(f.roadmapPath, 'utf8');
      const headBefore = head(f);
      expect(() =>
        applyTransition(openDesign(f), ctxFor(f), {
          onBeforeEffect: (i) => {
            if (i === pos) throw new Error(`injected fault at position ${pos}`);
          },
        }),
      ).toThrow(WorkflowError);
      // touched paths restored: roadmap byte-identical, journal not created
      expect(readFileSync(f.roadmapPath, 'utf8')).toBe(roadmapBefore);
      expect(existsSync(join(f.root, 'DEVELOPMENT-NOTES.md'))).toBe(false);
      // nothing committed, tree clean
      expect(head(f)).toBe(headBefore);
      expect(f.git(['status', '--porcelain']).trim()).toBe('');
    }
  });
});

describe('US4 atomic advance — dirty-tree precondition', () => {
  it('refuses loud when an advance-touched path has uncommitted changes', () => {
    const f = gitFixture();
    writeFileSync(f.roadmapPath, `${readFileSync(f.roadmapPath, 'utf8')}\n<!-- uncommitted -->\n`, 'utf8');
    expect(() => applyTransition(openDesign(f), ctxFor(f))).toThrow(/uncommitted changes/);
  });
});
