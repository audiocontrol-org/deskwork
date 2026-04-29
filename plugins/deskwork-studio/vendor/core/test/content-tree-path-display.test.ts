/**
 * Tests for `ContentNode.filePath` (Issue #70).
 *
 * The studio's content-tree renderer used to reconstruct the displayed
 * file path from `<node.path>/index.md`, which produced ghost paths
 * for hierarchical layouts where the actual file lives at
 * e.g. `<path>/prd.md` or `<path>/README.md`. The fix surfaces the
 * actual on-disk path on the node so the renderer can display reality.
 */

import { describe, it, expect } from 'vitest';
import {
  __resetLegacyFallbackWarnings,
  buildContentTree,
  findNode,
  type BuildOptions,
  type FsWalkEntry,
} from '../src/content-tree.ts';
import type { CalendarEntry } from '../src/types.ts';
import type { DeskworkConfig } from '../src/config.ts';
import type { ContentIndex } from '../src/content-index.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'wc.example',
        contentDir: 'src/content',
        calendarPath: 'docs/cal.md',
      },
    },
    defaultSite: 'wc',
  };
}

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    slug: 'placeholder',
    title: 'Placeholder',
    description: 'desc',
    stage: 'Ideas',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

const emptyLookup: BuildOptions['scrapbookLookup'] = () => ({
  items: [],
  secretItems: [],
});

describe('buildContentTree — node.filePath (Issue #70)', () => {
  it('node.filePath carries the actual on-disk path when an id binding exists (index.md case)', () => {
    __resetLegacyFallbackWarnings();
    // index.md case: tree node is the parent directory; filePath
    // points at the actual file inside it.
    const id = '11111111-2222-4333-8444-555555555555';
    const absFile = '/proj/src/content/projects/the-outbound/index.md';
    const fsEntries: FsWalkEntry[] = [
      {
        slug: 'projects',
        hasIndex: false,
        hasReadme: false,
        title: null,
      },
      {
        slug: 'projects/the-outbound',
        hasIndex: true,
        hasReadme: false,
        title: 'The Outbound',
      },
    ];
    const index: ContentIndex = {
      byId: new Map([[id, absFile]]),
      byPath: new Map([['projects/the-outbound/index.md', id]]),
      invalid: [],
    };

    const calendar: CalendarEntry[] = [
      entry({ id, slug: 'the-outbound', title: 'The Outbound', stage: 'Drafting' }),
    ];

    const projects = buildContentTree('wc', calendar, makeConfig(), '/proj', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fsEntries,
      contentIndex: index,
      warn: () => {},
    });

    expect(projects).toHaveLength(1);
    const project = projects[0];
    const node = findNode(project, 'projects/the-outbound');
    expect(node).not.toBeNull();
    expect(node?.entry).not.toBeNull();
    // The bug fix: filePath surfaces the actual on-disk file (.../index.md),
    // not a renderer-reconstructed path.
    expect(node?.filePath).toBe(absFile);
  });

  it('node.filePath surfaces non-index basenames (prd.md, README.md, etc.)', () => {
    __resetLegacyFallbackWarnings();
    // Hierarchical case (deskwork's own docs/feature layout): the file
    // is at `<dir>/prd.md`, not `<dir>/index.md`. The id-bound path
    // strips the extension into its own tree-node slot. The filePath
    // on that node carries the actual on-disk file.
    const id = '11111111-2222-4333-8444-555555555555';
    const absFile = '/proj/src/content/1.0/in-progress/my-feature/prd.md';
    const fsEntries: FsWalkEntry[] = [
      {
        slug: '1.0',
        hasIndex: false,
        hasReadme: false,
        title: null,
      },
      {
        slug: '1.0/in-progress',
        hasIndex: false,
        hasReadme: false,
        title: null,
      },
      {
        slug: '1.0/in-progress/my-feature',
        hasIndex: false,
        hasReadme: false,
        title: null,
      },
    ];
    const index: ContentIndex = {
      byId: new Map([[id, absFile]]),
      // The file isn't an index — it's prd.md.
      byPath: new Map([['1.0/in-progress/my-feature/prd.md', id]]),
      invalid: [],
    };

    const calendar: CalendarEntry[] = [
      entry({
        id,
        slug: 'my-feature',
        title: 'My Feature PRD',
        stage: 'Drafting',
      }),
    ];

    const projects = buildContentTree('wc', calendar, makeConfig(), '/proj', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fsEntries,
      contentIndex: index,
      warn: () => {},
    });

    expect(projects).toHaveLength(1);
    const project = projects[0];
    // The overlay lands at the path-minus-extension key.
    const node = findNode(project, '1.0/in-progress/my-feature/prd');
    expect(node).not.toBeNull();
    expect(node?.entry).not.toBeNull();
    expect(node?.filePath).toBe(absFile);
  });

  it('node.filePath is undefined when no id binding (legacy / pre-doctor)', () => {
    __resetLegacyFallbackWarnings();
    // Calendar entry with a slug-shaped fs path (audiocontrol-style).
    // No id binding — the fallback path matches by slug. The renderer
    // should fall through to its slug-derived path hint when filePath
    // is undefined.
    const fsEntries: FsWalkEntry[] = [
      {
        slug: 'flat-post',
        hasIndex: true,
        hasReadme: false,
        title: 'Flat Post',
      },
    ];
    const emptyIndex: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const calendar: CalendarEntry[] = [
      entry({ slug: 'flat-post', title: 'Flat Post', stage: 'Drafting' }),
    ];

    const projects = buildContentTree('wc', calendar, makeConfig(), '/proj', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fsEntries,
      contentIndex: emptyIndex,
      warn: () => {},
    });

    const node = findNode(projects[0], 'flat-post');
    expect(node).not.toBeNull();
    expect(node?.entry).not.toBeNull();
    // Without an id binding, no file path can be surfaced — the
    // renderer falls back to constructing the hint from node.path.
    expect(node?.filePath).toBeUndefined();
  });

  it('organizational nodes (no overlay) have no filePath', () => {
    __resetLegacyFallbackWarnings();
    const fsEntries: FsWalkEntry[] = [
      {
        slug: 'organizational',
        hasIndex: false,
        hasReadme: true,
        title: 'Organizational',
      },
    ];
    const emptyIndex: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const projects = buildContentTree('wc', [], makeConfig(), '/proj', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fsEntries,
      contentIndex: emptyIndex,
      warn: () => {},
    });
    const node = findNode(projects[0], 'organizational');
    expect(node).not.toBeNull();
    expect(node?.entry).toBeNull();
    expect(node?.filePath).toBeUndefined();
  });
});
