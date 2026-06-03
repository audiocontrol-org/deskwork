/**
 * Unit tests for add-time artifactPath composition (Phase 39c-2b
 * sub-task b). The composition is pure (no filesystem), so these are
 * value-in / value-out assertions — the disk side is covered by the CLI
 * integration tests.
 *
 * Post-barrage amendment (AUDIT-20260603-39/40/44/45): composition is
 * now KIND-AWARE — the extension derives from the artifact kind, legal
 * layouts are constrained per kind, the default layout is per-kind, and
 * the join is forward-slash (POSIX) only.
 */

import { describe, it, expect } from 'vitest';
import {
  composeAddArtifactPath,
  composeRelativePath,
  layoutToContentRelativePath,
  parseScaffoldLayout,
  defaultLayoutForKind,
  legalLayoutsForKind,
  isLayoutLegalForKind,
  DEFAULT_SCAFFOLD_LAYOUT,
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

describe('layoutToContentRelativePath (markdown-only legacy helper)', () => {
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

describe('composeRelativePath (kind-aware) — AUDIT-39', () => {
  it('markdown + index → <slug>/index.md', () => {
    expect(composeRelativePath('markdown', 'index', 'my-post')).toBe(
      'my-post/index.md',
    );
  });
  it('markdown + readme → <slug>/README.md', () => {
    expect(composeRelativePath('markdown', 'readme', 'my-post')).toBe(
      'my-post/README.md',
    );
  });
  it('markdown + flat → <slug>.md', () => {
    expect(composeRelativePath('markdown', 'flat', 'my-post')).toBe(
      'my-post.md',
    );
  });
  it('html-mockup + index → <slug>/index.html', () => {
    expect(composeRelativePath('html-mockup', 'index', 'design-x')).toBe(
      'design-x/index.html',
    );
  });
  it('single-file-html + flat → <slug>.html', () => {
    expect(composeRelativePath('single-file-html', 'flat', 'banner')).toBe(
      'banner.html',
    );
  });
  it('rejects an illegal (kind, layout) combination', () => {
    expect(() =>
      composeRelativePath('single-file-html', 'index', 'banner'),
    ).toThrowError(/single-file-html/);
    expect(() =>
      composeRelativePath('html-mockup', 'flat', 'design-x'),
    ).toThrowError(/html-mockup/);
  });
  it('rejects image (not templatable)', () => {
    expect(() =>
      composeRelativePath('image', 'index', 'photo'),
    ).toThrowError(/image/);
  });
});

describe('per-kind layout policy — AUDIT-44', () => {
  it('markdown allows index, readme, flat; default index', () => {
    expect(legalLayoutsForKind('markdown')).toEqual(['index', 'readme', 'flat']);
    expect(defaultLayoutForKind('markdown')).toBe('index');
  });
  it('html-mockup allows only index; default index', () => {
    expect(legalLayoutsForKind('html-mockup')).toEqual(['index']);
    expect(defaultLayoutForKind('html-mockup')).toBe('index');
  });
  it('single-file-html allows only flat; default flat', () => {
    expect(legalLayoutsForKind('single-file-html')).toEqual(['flat']);
    expect(defaultLayoutForKind('single-file-html')).toBe('flat');
  });
  it('image has no legal layouts and no default', () => {
    expect(legalLayoutsForKind('image')).toEqual([]);
    expect(defaultLayoutForKind('image')).toBeUndefined();
  });
  it('isLayoutLegalForKind reflects the policy', () => {
    expect(isLayoutLegalForKind('markdown', 'flat')).toBe(true);
    expect(isLayoutLegalForKind('single-file-html', 'index')).toBe(false);
    expect(isLayoutLegalForKind('html-mockup', 'readme')).toBe(false);
    expect(isLayoutLegalForKind('image', 'index')).toBe(false);
  });
});

describe('DEFAULT_SCAFFOLD_LAYOUT', () => {
  it('is index — the markdown/html-mockup per-kind default', () => {
    expect(DEFAULT_SCAFFOLD_LAYOUT).toBe('index');
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

describe('composeAddArtifactPath', () => {
  it('markdown default layout composes <dir>/<slug>/index.md', () => {
    expect(composeAddArtifactPath(lane(), 'markdown', 'my-post')).toBe(
      'src/content/blog/my-post/index.md',
    );
  });

  it('html-mockup default layout composes <dir>/<slug>/index.html', () => {
    const multi = lane({
      scaffoldDefaults: { 'html-mockup': 'content/mockups' },
    });
    expect(composeAddArtifactPath(multi, 'html-mockup', 'design-x')).toBe(
      'content/mockups/design-x/index.html',
    );
  });

  it('single-file-html default layout composes <dir>/<slug>.html', () => {
    const multi = lane({
      scaffoldDefaults: { 'single-file-html': 'content/html' },
    });
    expect(composeAddArtifactPath(multi, 'single-file-html', 'banner')).toBe(
      'content/html/banner.html',
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

  it('rejects an illegal (kind, layout) override — AUDIT-44', () => {
    const multi = lane({
      scaffoldDefaults: { 'single-file-html': 'content/html' },
    });
    expect(() =>
      composeAddArtifactPath(multi, 'single-file-html', 'banner', 'index'),
    ).toThrowError(/single-file-html/);
  });

  it('rejects image (not templatable) — AUDIT-42', () => {
    const multi = lane({ scaffoldDefaults: { image: 'content/img' } });
    expect(() =>
      composeAddArtifactPath(multi, 'image', 'photo'),
    ).toThrowError(/image/);
  });

  it('throws a loud, actionable error when the kind has no default', () => {
    const onlyMarkdown = lane({
      id: 'mockups',
      scaffoldDefaults: { markdown: 'src/content/blog' },
    });
    expect(() =>
      composeAddArtifactPath(onlyMarkdown, 'html-mockup', 'design-x'),
    ).toThrowError(/mockups/);
    expect(() =>
      composeAddArtifactPath(onlyMarkdown, 'html-mockup', 'design-x'),
    ).toThrowError(/html-mockup/);
    // Names the fix (no silent fallback).
    expect(() =>
      composeAddArtifactPath(onlyMarkdown, 'html-mockup', 'design-x'),
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
