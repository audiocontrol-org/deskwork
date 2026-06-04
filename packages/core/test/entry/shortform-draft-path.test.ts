/**
 * Phase 39c-2b(a) — shortform draft path is COMPOSED from the parent
 * entry's stored `artifactPath` directory (spec AUDIT-35), not searched
 * via `findEntryFile`/`contentDir`.
 *
 * A shortform draft is a NEW file in the parent entry's scrapbook:
 *   <dir-of-parent-artifact>/scrapbook/shortform/<platform>[-<channel>].md
 *
 * The parent's directory comes from `resolveArtifactPathOrThrow` (stored
 * path only; throws `doctor --fix` when absent). The channel, when
 * present, must be kebab-case (same shape as a slug segment).
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { composeShortformDraftPath } from '../../src/entry/shortform-path.ts';
import type { Entry } from '../../src/schema/entry.ts';

const PROJECT_ROOT = '/projects/example';

function makeSidecar(overrides: Partial<Entry> = {}): Entry {
  const base: Entry = {
    uuid: '22222222-2222-2222-2222-222222222222',
    slug: 'my-post',
    title: 'My Post',
    keywords: [],
    source: 'human',
    currentStage: 'Published',
    iterationByStage: {},
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

describe('composeShortformDraftPath — 39c-2b(a) compose from parent artifactPath dir', () => {
  it('composes <entryDir>/scrapbook/shortform/<platform>.md (no channel)', () => {
    const entry = makeSidecar({ artifactPath: 'docs/my-post/index.md' });
    expect(composeShortformDraftPath(entry, PROJECT_ROOT, 'linkedin')).toBe(
      join(PROJECT_ROOT, 'docs/my-post/scrapbook/shortform/linkedin.md'),
    );
  });

  it('appends -<channel> when a channel is supplied', () => {
    const entry = makeSidecar({ artifactPath: 'docs/my-post/index.md' });
    expect(
      composeShortformDraftPath(entry, PROJECT_ROOT, 'reddit', 'synthdiy'),
    ).toBe(
      join(PROJECT_ROOT, 'docs/my-post/scrapbook/shortform/reddit-synthdiy.md'),
    );
  });

  it('throws doctor --fix when the parent entry has no artifactPath', () => {
    const entry = makeSidecar();
    expect(() =>
      composeShortformDraftPath(entry, PROJECT_ROOT, 'linkedin'),
    ).toThrow(/doctor --fix/);
  });

  it('rejects a non-kebab-case channel', () => {
    const entry = makeSidecar({ artifactPath: 'docs/my-post/index.md' });
    expect(() =>
      composeShortformDraftPath(entry, PROJECT_ROOT, 'reddit', 'Synth DIY'),
    ).toThrow(/channel/i);
  });
});
