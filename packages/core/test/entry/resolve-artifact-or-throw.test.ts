/**
 * Phase 39c-2b(a) — shared act-on-existing artifact resolver.
 *
 * `resolveArtifactPathOrThrow(entry, projectRoot)` is the canonical
 * "act on an existing entry → its on-disk document" resolver: it reads
 * the STORED `artifactPath` only (via `resolveStoredArtifactPath`),
 * THROWS a `doctor --fix`-pointing error when the path is absent, and
 * applies the `refineToIndexDoc` read-side refinement to the present
 * case. Studio's `resolveIndexPath` (39d) inlined exactly this logic;
 * 39c-2b(a) promotes it to core so the CLI verbs (publish / iterate
 * longform) share one resolver with the studio rather than duplicating
 * the throw message (which would land as a clones.yaml group).
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveArtifactPathOrThrow } from '../../src/entry/resolve-artifact.ts';
import type { Entry } from '../../src/schema/entry.ts';

const PROJECT_ROOT = '/projects/example';

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

describe('resolveArtifactPathOrThrow — 39c-2b(a) shared act-on-existing resolver', () => {
  it('returns the stored artifact path (no index.md sibling on disk) verbatim', () => {
    // dirname is .../content/somewhere-else; .../somewhere-else/index.md does
    // NOT exist, so refineToIndexDoc returns the artifact path itself.
    const entry = makeSidecar({
      artifactPath: 'content/somewhere-else/my-post.md',
    });
    expect(resolveArtifactPathOrThrow(entry, PROJECT_ROOT)).toBe(
      join(PROJECT_ROOT, 'content/somewhere-else/my-post.md'),
    );
  });

  it('throws a doctor --fix-pointing error citing slug + uuid when artifactPath is absent', () => {
    const entry = makeSidecar();
    expect(() => resolveArtifactPathOrThrow(entry, PROJECT_ROOT)).toThrow(
      /doctor --fix/,
    );
    expect(() => resolveArtifactPathOrThrow(entry, PROJECT_ROOT)).toThrow(
      /my-post/,
    );
    expect(() => resolveArtifactPathOrThrow(entry, PROJECT_ROOT)).toThrow(
      /11111111-1111-1111-1111-111111111111/,
    );
  });
});
