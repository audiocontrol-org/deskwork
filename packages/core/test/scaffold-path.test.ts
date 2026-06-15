/**
 * Unit tests for add-time artifactPath composition (Phase 39c-2b
 * sub-task b). The composition is pure (no filesystem), so these are
 * value-in / value-out assertions — the disk side is covered by the CLI
 * integration tests.
 *
 * Simplification (operator decision): `deskwork add` supports ONLY
 * markdown entries right now — the verb that materializes the file
 * (scaffoldBlogPost) is markdown-only, so non-markdown kinds can't be
 * created. The premature multi-kind machinery (per-kind extensions,
 * per-kind legal-layout matrix, image --artifact-path) is removed; a
 * non-markdown kind is rejected loudly. The POSIX forward-slash join
 * (AUDIT-40) is retained.
 */

import { describe, it, expect } from 'vitest';
import {
  composeAddArtifactPath,
  layoutToContentRelativePath,
  parseScaffoldLayout,
  DEFAULT_SCAFFOLD_LAYOUT,
  SCAFFOLD_LAYOUTS,
} from '../src/lanes/scaffold-path.ts';
import type { LaneConfig } from '../src/lanes/types.ts';

function lane(overrides?: Partial<LaneConfig>): LaneConfig {
  return {
    id: 'blog',
    name: 'Blog',
    pipelineTemplate: 'editorial',
    scaffoldDefaults: { markdown: 'src/content/blog' },
    ...overrides,
  };
}

describe('layoutToContentRelativePath (markdown shapes)', () => {
  it('maps index → <slug>/index.md', () => {
    expect(layoutToContentRelativePath('index', 'my-post')).toBe(
      'my-post/index.md',
    );
  });
  it('maps readme → <slug>/README.md', () => {
    expect(layoutToContentRelativePath('readme', 'my-post')).toBe(
      'my-post/README.md',
    );
  });
  it('maps flat → <slug>.md', () => {
    expect(layoutToContentRelativePath('flat', 'my-post')).toBe('my-post.md');
  });
});

describe('DEFAULT_SCAFFOLD_LAYOUT', () => {
  it('is index — the global markdown default (Decision #12)', () => {
    expect(DEFAULT_SCAFFOLD_LAYOUT).toBe('index');
  });
});

describe('SCAFFOLD_LAYOUTS', () => {
  it('is the three legal markdown layouts', () => {
    expect(SCAFFOLD_LAYOUTS).toEqual(['index', 'readme', 'flat']);
  });
});

describe('parseScaffoldLayout', () => {
  it('accepts the three legal values', () => {
    expect(parseScaffoldLayout('index')).toBe('index');
    expect(parseScaffoldLayout('readme')).toBe('readme');
    expect(parseScaffoldLayout('flat')).toBe('flat');
  });
  it('returns undefined for an unrecognized value', () => {
    expect(parseScaffoldLayout('pdf')).toBeUndefined();
    expect(parseScaffoldLayout('')).toBeUndefined();
  });
});

describe('composeAddArtifactPath (markdown only)', () => {
  it('markdown default layout composes <dir>/<slug>/index.md', () => {
    expect(composeAddArtifactPath(lane(), 'markdown', 'my-post')).toBe(
      'src/content/blog/my-post/index.md',
    );
  });

  it('--layout flat (markdown) composes <dir>/<slug>.md', () => {
    expect(composeAddArtifactPath(lane(), 'markdown', 'my-post', 'flat')).toBe(
      'src/content/blog/my-post.md',
    );
  });

  it('--layout readme (markdown) composes <dir>/<slug>/README.md', () => {
    expect(
      composeAddArtifactPath(lane(), 'markdown', 'my-post', 'readme'),
    ).toBe('src/content/blog/my-post/README.md');
  });

  it('honors a nested (slash-separated) slug', () => {
    expect(
      composeAddArtifactPath(lane(), 'markdown', 'series/part-one'),
    ).toBe('src/content/blog/series/part-one/index.md');
  });

  it('joins with forward slashes only (POSIX) — AUDIT-40', () => {
    const result = composeAddArtifactPath(lane(), 'markdown', 'my-post');
    expect(result).not.toContain('\\');
    expect(result.split('/').length).toBeGreaterThan(1);
  });

  it('rejects a non-markdown kind loudly (html-mockup)', () => {
    expect(() =>
      composeAddArtifactPath(lane(), 'html-mockup', 'design-x'),
    ).toThrowError(/markdown/);
    expect(() =>
      composeAddArtifactPath(lane(), 'html-mockup', 'design-x'),
    ).toThrowError(/html-mockup/);
  });

  it('rejects a non-markdown kind loudly (single-file-html)', () => {
    expect(() =>
      composeAddArtifactPath(lane(), 'single-file-html', 'banner'),
    ).toThrowError(/single-file-html/);
  });

  it('rejects a non-markdown kind loudly (image)', () => {
    expect(() =>
      composeAddArtifactPath(lane(), 'image', 'photo'),
    ).toThrowError(/image/);
  });

  it('throws a loud error when the markdown default is absent', () => {
    const noMarkdown = lane({
      id: 'mockups',
      scaffoldDefaults: { 'html-mockup': 'content/mockups' },
    });
    expect(() =>
      composeAddArtifactPath(noMarkdown, 'markdown', 'design-x'),
    ).toThrowError(/mockups/);
    expect(() =>
      composeAddArtifactPath(noMarkdown, 'markdown', 'design-x'),
    ).toThrowError(/markdown/);
    // Names the fix (no silent fallback).
    expect(() =>
      composeAddArtifactPath(noMarkdown, 'markdown', 'design-x'),
    ).toThrowError(/scaffold-default/);
  });

  it('throws when the lane has no scaffoldDefaults map at all', () => {
    const bare = lane({ id: 'bare', scaffoldDefaults: undefined });
    expect(() =>
      composeAddArtifactPath(bare, 'markdown', 'whatever'),
    ).toThrowError(/bare/);
    expect(() =>
      composeAddArtifactPath(bare, 'markdown', 'whatever'),
    ).toThrowError(/markdown/);
  });
});
