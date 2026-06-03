/**
 * Unit tests for add-time artifactPath composition (Phase 39c-2b
 * sub-task b). The composition is pure (no filesystem), so these are
 * value-in / value-out assertions — the disk side is covered by the CLI
 * integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  composeAddArtifactPath,
  layoutToContentRelativePath,
  parseScaffoldLayout,
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

describe('layoutToContentRelativePath', () => {
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
  it('is index — reproduces the legacy {slug}/index.md behavior', () => {
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
  it('default layout composes <dir>/<slug>/index.md', () => {
    expect(composeAddArtifactPath(lane(), 'markdown', 'my-post')).toBe(
      'src/content/blog/my-post/index.md',
    );
  });

  it('--layout flat composes <dir>/<slug>.md', () => {
    expect(composeAddArtifactPath(lane(), 'markdown', 'my-post', 'flat')).toBe(
      'src/content/blog/my-post.md',
    );
  });

  it('--layout readme composes <dir>/<slug>/README.md', () => {
    expect(
      composeAddArtifactPath(lane(), 'markdown', 'my-post', 'readme'),
    ).toBe('src/content/blog/my-post/README.md');
  });

  it('honors a nested (slash-separated) slug', () => {
    expect(
      composeAddArtifactPath(lane(), 'markdown', 'series/part-one'),
    ).toBe('src/content/blog/series/part-one/index.md');
  });

  it('selects the directory for the requested kind', () => {
    const multi = lane({
      scaffoldDefaults: {
        markdown: 'docs/plans',
        'html-mockup': 'mockups',
      },
    });
    expect(composeAddArtifactPath(multi, 'html-mockup', 'design-x')).toBe(
      'mockups/design-x/index.md',
    );
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
