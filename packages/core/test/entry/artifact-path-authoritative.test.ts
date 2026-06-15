/**
 * Phase 39a — stored-path-only entry resolution.
 *
 * `resolveStoredArtifactPath(sidecar, projectRoot)` is the additive,
 * stored-path-only resolver: it returns `join(projectRoot, sidecar.artifactPath)`
 * when `artifactPath` is present, and `null` otherwise. It NEVER consults the
 * slug+stage heuristic (that runtime path is removed in 39d) and NEVER throws
 * (throwing on a missing path is 39d's job). This test pins both behaviours.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveStoredArtifactPath } from '../../src/entry/resolve-artifact.ts';
import type { Entry } from '../../src/schema/entry.ts';

const PROJECT_ROOT = '/projects/example';

/**
 * Minimal sidecar fixture. `slug` + `currentStage` are populated with values
 * that the slug+stage heuristic WOULD resolve to a different path — proving the
 * stored-path-only resolver ignores them entirely.
 */
function makeSidecar(overrides: Partial<Entry> = {}): Entry {
  const base: Entry = {
    uuid: '11111111-1111-1111-1111-111111111111',
    slug: 'my-post',
    title: 'My Post',
    keywords: [],
    source: 'human',
    currentStage: 'Drafting',
    iterationByStage: {},
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

describe('resolveStoredArtifactPath — 39a stored-path-only resolution', () => {
  it('returns join(projectRoot, artifactPath) verbatim when stamped, never the heuristic', () => {
    const sidecar = makeSidecar({
      artifactPath: 'content/somewhere-else/my-post.md',
    });
    const resolved = resolveStoredArtifactPath(sidecar, PROJECT_ROOT);
    expect(resolved).toBe(join(PROJECT_ROOT, 'content/somewhere-else/my-post.md'));
    // The slug+stage heuristic would resolve Drafting → docs/my-post/index.md;
    // the stored path is honoured instead, proving no heuristic consultation.
    expect(resolved).not.toBe(join(PROJECT_ROOT, 'docs', 'my-post', 'index.md'));
  });

  it('returns null when artifactPath is absent (no heuristic, no throw)', () => {
    const sidecar = makeSidecar();
    expect(() => resolveStoredArtifactPath(sidecar, PROJECT_ROOT)).not.toThrow();
    expect(resolveStoredArtifactPath(sidecar, PROJECT_ROOT)).toBeNull();
  });
});
