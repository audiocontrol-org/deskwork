// 024 US4 / FR-011 + FR-012 — govern is runnable on the session-pinned branch.
// FR-012 (TASK-83): a `/stack-control:*` backtick skill-reference span is NOT a
// governed filesystem path, so it must not crash payload assembly. FR-011: govern
// resolves the feature from the SPECKIT marker / spec pointer, not the branch slug.
// RED first (T006/T007).

import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../_run-helpers.js';
import { extractScopedPaths } from '../../govern/incremental-audit.js';
import { readActiveFeatureSlug, resolveConvergenceItem, resolveFeatureFromItem, resolveFeatureSlug } from '../../govern/feature-resolution.js';
import { resolveInstallation } from '../../config/installation.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

describe('024 FR-012 — backtick skill-reference span is not a governed path (TASK-83)', () => {
  it('skips a /stack-control:<verb> skill reference span', () => {
    const body = 'Run the `/stack-control:define` skill before authoring.';
    expect(extractScopedPaths(body)).toEqual([]);
  });

  it('skips a plugin-namespaced skill reference but keeps a real path span', () => {
    const body = [
      'See `/stack-control:execute` and `/dw-lifecycle:implement`.',
      'The fix lives in `src/govern/protocol.ts` and `templates/WORKFLOW.md`.',
    ].join('\n');
    expect(extractScopedPaths(body)).toEqual(['src/govern/protocol.ts', 'templates/WORKFLOW.md']);
  });

  it('still extracts a genuine nested path span', () => {
    expect(extractScopedPaths('edit `src/workflow/compass.ts` now')).toEqual([
      'src/workflow/compass.ts',
    ]);
  });

  it('keeps a file:line span, stripping the trailing line[:col] suffix (claude-01)', () => {
    // The blunt includes(':') guard silently dropped these; a real governed path with a
    // line number must survive (it appears verbatim in this feature's own contract docs).
    expect(extractScopedPaths('see `src/govern/protocol.ts:141`')).toEqual(['src/govern/protocol.ts']);
    expect(extractScopedPaths('at `src/workflow/compass.ts:88:7`')).toEqual(['src/workflow/compass.ts']);
  });

  it('still excludes a /<plugin>:<verb> skill ref even with no line number', () => {
    expect(extractScopedPaths('`/stack-control:define` and `src/x.ts:3`')).toEqual(['src/x.ts']);
  });
});

describe('024 FR-011 — feature slug resolves from the marker, not only the branch', () => {
  it('prefers an explicit slug', () => {
    expect(
      resolveFeatureSlug({ explicit: '024-lifecycle-compass', branch: 'feature/stack-control' }),
    ).toBe('024-lifecycle-compass');
  });

  it('falls back to the SPECKIT marker slug when the branch slug has no feature root', () => {
    // On the session-pinned branch the slug `stack-control` resolves to no spec dir;
    // the marker names the active feature. The resolver is given a marker slug and a
    // predicate that reports which candidate slugs have an existing feature root.
    const slug = resolveFeatureSlug({
      branch: 'feature/stack-control',
      markerSlug: '024-lifecycle-compass',
      featureRootExists: (s) => s === '024-lifecycle-compass',
    });
    expect(slug).toBe('024-lifecycle-compass');
  });

  it('uses the branch slug when its feature root exists', () => {
    const slug = resolveFeatureSlug({
      branch: 'feature/013-foo',
      markerSlug: '024-lifecycle-compass',
      featureRootExists: (s) => s === '013-foo',
    });
    expect(slug).toBe('013-foo');
  });

  it('fails loud when neither branch slug, marker, nor explicit resolves a feature', () => {
    expect(() =>
      resolveFeatureSlug({
        branch: 'feature/stack-control',
        markerSlug: null,
        featureRootExists: () => false,
      }),
    ).toThrow(/feature/i);
  });
});

let convFixtures: WorkflowFixture[] = [];
afterEach(() => {
  for (const f of convFixtures) f.cleanup();
  convFixtures = [];
});
function convFixture(nodes: Parameters<typeof makeWorkflowFixture>[0]): WorkflowFixture {
  const f = makeWorkflowFixture(nodes);
  convFixtures.push(f);
  return f;
}

describe('024 FR-013 — resolveConvergenceItem keys by canonical node id or fails loud (codex-02/claude-04)', () => {
  it('returns the canonical node id when a roadmap node references the governed spec dir', () => {
    const f = convFixture([{ identifier: 'multi:feature/x', status: 'in-flight', spec: 'specs/010-x' }]);
    const inst = resolveInstallation(f.root);
    expect(resolveConvergenceItem(inst, `${inst.root}/specs/010-x`, 'x')).toBe('multi:feature/x');
  });

  it('FAILS LOUD when the roadmap cannot be read — never invents a divergent fallback key', () => {
    const f = convFixture([]); // no ROADMAP.md written
    const inst = resolveInstallation(f.root);
    expect(() => resolveConvergenceItem(inst, `${inst.root}/specs/010-x`, 'x')).toThrow();
  });

  it('FAILS LOUD when the roadmap is readable but no node references the governed dir (orphan)', () => {
    const f = convFixture([{ identifier: 'multi:feature/other', status: 'in-flight', spec: 'specs/999-other' }]);
    const inst = resolveInstallation(f.root);
    expect(() => resolveConvergenceItem(inst, `${inst.root}/specs/010-x`, 'x')).toThrow(/node/i);
  });

  it('returns the slug when no feature dir is governed (spec mode)', () => {
    const f = convFixture([]);
    const inst = resolveInstallation(f.root);
    expect(resolveConvergenceItem(inst, undefined, 'fallback-slug')).toBe('fallback-slug');
  });
});

describe('024 codex-01 — govern resolves by item/marker, not an incidental branch', () => {
  it('prefers the marker over the branch slug when BOTH feature roots exist', () => {
    // an incidental branch slug must not win over the deliberate active-feature marker
    expect(
      resolveFeatureSlug({ branch: 'feature/013-foo', markerSlug: '024-compass', featureRootExists: () => true }),
    ).toBe('024-compass');
  });

  it('resolveFeatureFromItem resolves the feature slug authoritatively from the item spec pointer', () => {
    const f = convFixture([{ identifier: 'multi:feature/x', status: 'in-flight', spec: 'specs/024-compass' }]);
    const inst = resolveInstallation(f.root);
    expect(resolveFeatureFromItem(inst, 'multi:feature/x')).toBe('024-compass');
  });

  it('resolveFeatureFromItem fails loud for an unknown item or an item with no spec pointer', () => {
    const f = convFixture([{ identifier: 'multi:feature/nospec', status: 'planned' }]);
    const inst = resolveInstallation(f.root);
    expect(() => resolveFeatureFromItem(inst, 'multi:feature/missing')).toThrow(/item/i);
    expect(() => resolveFeatureFromItem(inst, 'multi:feature/nospec')).toThrow(/spec/i);
  });
});

describe('024 codex-01 — govern --item runs the compass precondition (no bypass)', () => {
  it('refuses an item not ready for governing, before any barrage', () => {
    // item at `specifying` (spec set, not analyze-clean) → govern (governing) is `ahead`
    const f = convFixture([
      { identifier: 'multi:feature/x', status: 'in-flight', design: 'd', spec: 'specs/024-x', analyzeClean: false },
    ]);
    const r = runCli(['govern', '--mode', 'implement', '--item', 'multi:feature/x'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/REFUSED|compass|ahead/i);
  });
});

describe('024 codex-03 — a malformed active-feature marker fails loud (not silently absent)', () => {
  it('returns null when .specify/feature.json is genuinely absent', () => {
    const f = convFixture([]);
    expect(readActiveFeatureSlug(f.root)).toBeNull();
  });
  it('returns the basename when the marker is valid', () => {
    const f = convFixture([]);
    f.write('.specify/feature.json', JSON.stringify({ feature_directory: 'specs/024-x' }));
    expect(readActiveFeatureSlug(f.root)).toBe('024-x');
  });
  it('THROWS when the marker exists but is unparseable', () => {
    const f = convFixture([]);
    f.write('.specify/feature.json', '{ not json');
    expect(() => readActiveFeatureSlug(f.root)).toThrow(/feature\.json|marker/i);
  });
  it('THROWS when the marker exists but has no feature_directory', () => {
    const f = convFixture([]);
    f.write('.specify/feature.json', JSON.stringify({ wrong: 'key' }));
    expect(() => readActiveFeatureSlug(f.root)).toThrow(/feature_directory|marker/i);
  });
});
