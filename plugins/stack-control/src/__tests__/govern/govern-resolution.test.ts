// 024 US4 / FR-011 + FR-012 — govern is runnable on the session-pinned branch.
// FR-012 (TASK-83): a `/stack-control:*` backtick skill-reference span is NOT a
// governed filesystem path, so it must not crash payload assembly. FR-011: govern
// resolves the feature from the SPECKIT marker / spec pointer, not the branch slug.
// RED first (T006/T007).

import { describe, expect, it } from 'vitest';
import { extractScopedPaths } from '../../govern/incremental-audit.js';
import { resolveFeatureSlug } from '../../govern/feature-resolution.js';

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
