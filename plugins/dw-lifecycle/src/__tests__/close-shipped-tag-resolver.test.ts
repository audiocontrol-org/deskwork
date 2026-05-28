import { describe, it, expect } from 'vitest';
import {
  TagResolutionError,
  assertTagsExist,
  listSemverTags,
  resolveDefaults,
} from '../close-shipped/tag-resolver.js';
import type { RunGit } from '../close-shipped/types.js';

function mockGitTags(tags: readonly string[]): RunGit {
  return (args) => {
    if (args[0] === 'tag' && args[1] === '--list') {
      return tags.join('\n');
    }
    if (args[0] === 'rev-parse' && args[1] === '--verify') {
      // Treat as existing iff the tag was in the list.
      const refArg = args[2] ?? '';
      const tag = refArg.replace(/^refs\/tags\//, '');
      if (!tags.includes(tag)) throw new Error('not found');
      return 'sha';
    }
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  };
}

describe('listSemverTags', () => {
  it('parses and sorts tags by semver ascending', () => {
    const runGit = mockGitTags(['v0.1.0', 'v0.10.0', 'v0.2.0', 'v1.0.0']);
    const tags = listSemverTags({ runGit });
    expect(tags.map((t) => t.raw)).toEqual([
      'v0.1.0',
      'v0.2.0',
      'v0.10.0',
      'v1.0.0',
    ]);
  });

  it('skips tags that do not match the semver pattern', () => {
    const runGit = mockGitTags([
      'v1.0.0',
      'vX.Y.Z',
      'release/1.0',
      'v2.0.0-beta.1',
    ]);
    const tags = listSemverTags({ runGit });
    expect(tags.map((t) => t.raw)).toEqual(['v1.0.0', 'v2.0.0-beta.1']);
  });

  it('orders prereleases before the matching release', () => {
    const runGit = mockGitTags(['v1.0.0', 'v1.0.0-rc.1', 'v1.0.0-alpha.1']);
    const tags = listSemverTags({ runGit });
    expect(tags.map((t) => t.raw)).toEqual([
      'v1.0.0-alpha.1',
      'v1.0.0-rc.1',
      'v1.0.0',
    ]);
  });

  it('returns empty list when no tags match', () => {
    const runGit = mockGitTags([]);
    expect(listSemverTags({ runGit })).toEqual([]);
  });
});

describe('resolveDefaults', () => {
  it('honors both overrides when supplied', () => {
    const runGit = mockGitTags([]);
    const resolved = resolveDefaults({
      runGit,
      fromTagOverride: 'vX',
      toTagOverride: 'vY',
    });
    expect(resolved.fromTag).toBe('vX');
    expect(resolved.toTag).toBe('vY');
    expect(resolved.fromTagDefaulted).toBe(false);
    expect(resolved.toTagDefaulted).toBe(false);
  });

  it('defaults both to the two most-recent semver tags', () => {
    const runGit = mockGitTags(['v1.0.0', 'v1.1.0', 'v1.2.0']);
    const resolved = resolveDefaults({
      runGit,
      fromTagOverride: null,
      toTagOverride: null,
    });
    expect(resolved.fromTag).toBe('v1.1.0');
    expect(resolved.toTag).toBe('v1.2.0');
    expect(resolved.fromTagDefaulted).toBe(true);
    expect(resolved.toTagDefaulted).toBe(true);
  });

  it('defaults only --from-tag when --to-tag is supplied', () => {
    const runGit = mockGitTags(['v1.0.0', 'v1.1.0', 'v1.2.0', 'v2.0.0']);
    const resolved = resolveDefaults({
      runGit,
      fromTagOverride: null,
      toTagOverride: 'v1.2.0',
    });
    expect(resolved.fromTag).toBe('v1.1.0');
    expect(resolved.toTag).toBe('v1.2.0');
    expect(resolved.fromTagDefaulted).toBe(true);
    expect(resolved.toTagDefaulted).toBe(false);
  });

  it('defaults only --to-tag when --from-tag is supplied', () => {
    const runGit = mockGitTags(['v1.0.0', 'v1.1.0', 'v1.2.0']);
    const resolved = resolveDefaults({
      runGit,
      fromTagOverride: 'v0.9.0',
      toTagOverride: null,
    });
    expect(resolved.fromTag).toBe('v0.9.0');
    expect(resolved.toTag).toBe('v1.2.0');
  });

  it('throws when no semver tags exist and no overrides supplied', () => {
    const runGit = mockGitTags([]);
    expect(() =>
      resolveDefaults({
        runGit,
        fromTagOverride: null,
        toTagOverride: null,
      }),
    ).toThrow(TagResolutionError);
  });

  it('throws when only one semver tag exists and no --from-tag override', () => {
    const runGit = mockGitTags(['v1.0.0']);
    expect(() =>
      resolveDefaults({
        runGit,
        fromTagOverride: null,
        toTagOverride: null,
      }),
    ).toThrow(/Only one .* tag found/);
  });

  it('throws when --to-tag override has no previous tag in the list', () => {
    const runGit = mockGitTags(['v1.0.0', 'v2.0.0']);
    expect(() =>
      resolveDefaults({
        runGit,
        fromTagOverride: null,
        toTagOverride: 'v1.0.0',
      }),
    ).toThrow(/No previous release tag/);
  });
});

describe('assertTagsExist', () => {
  it('passes when both tags exist', () => {
    const runGit = mockGitTags(['v1.0.0', 'v1.1.0']);
    expect(() => assertTagsExist('v1.0.0', 'v1.1.0', runGit)).not.toThrow();
  });

  it('throws when from-tag is missing', () => {
    const runGit = mockGitTags(['v1.1.0']);
    expect(() => assertTagsExist('v1.0.0', 'v1.1.0', runGit)).toThrow(
      TagResolutionError,
    );
  });

  it('throws when to-tag is missing', () => {
    const runGit = mockGitTags(['v1.0.0']);
    expect(() => assertTagsExist('v1.0.0', 'v1.1.0', runGit)).toThrow(
      TagResolutionError,
    );
  });
});
