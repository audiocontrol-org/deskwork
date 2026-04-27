/**
 * Unit tests for the content-tree builder.
 *
 * Uses an injected scrapbook lookup so the tests don't depend on a
 * live filesystem. Real-fs paths get exercised in the studio
 * integration test (test/content-page.test.ts in @deskwork/studio).
 */

import { describe, it, expect } from 'vitest';
import {
  buildContentTree,
  findNode,
  flattenForRender,
  type BuildOptions,
  type FsWalkEntry,
} from '../src/content-tree.ts';
import type { CalendarEntry } from '../src/types.ts';
import type { DeskworkConfig } from '../src/config.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'wc.example',
        contentDir: 'src/content/projects',
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

describe('buildContentTree — flat calendar', () => {
  it('produces one project per top-level slug', () => {
    const entries = [
      entry({ slug: 'whats-in-a-name', title: 'What’s in a Name?', stage: 'Published' }),
      entry({ slug: 'on-revising', title: 'On Revising', stage: 'Drafting' }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    expect(projects.map((p) => p.rootSlug)).toEqual([
      'on-revising',
      'whats-in-a-name',
    ]);
    expect(projects.every((p) => p.totalNodes === 1)).toBe(true);
    expect(projects.every((p) => p.maxDepth === 1)).toBe(true);
  });
});

describe('buildContentTree — hierarchical calendar', () => {
  const entries: CalendarEntry[] = [
    entry({ slug: 'the-outbound', title: 'The Outbound', stage: 'Drafting' }),
    entry({
      slug: 'the-outbound/characters',
      title: 'Characters',
      stage: 'Outlining',
    }),
    entry({
      slug: 'the-outbound/characters/strivers',
      title: 'Strivers',
      stage: 'Drafting',
    }),
    entry({
      slug: 'the-outbound/characters/dreamers',
      title: 'Dreamers',
      stage: 'Planned',
    }),
    entry({
      slug: 'the-outbound/structure',
      title: 'Structure',
      stage: 'Drafting',
    }),
  ];

  it('nests entries by slug shape', () => {
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    expect(projects).toHaveLength(1);
    const project = projects[0];
    expect(project.rootSlug).toBe('the-outbound');
    expect(project.title).toBe('The Outbound');
    expect(project.trackedCount).toBe(5);
    expect(project.totalNodes).toBe(5);
    expect(project.maxDepth).toBe(3);
    expect(project.predominantLane).toBe('Drafting');
  });

  it('sorts children by slug', () => {
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    const root = projects[0].root;
    expect(root.children.map((c) => c.slug)).toEqual([
      'the-outbound/characters',
      'the-outbound/structure',
    ]);
    const characters = root.children.find(
      (c) => c.slug === 'the-outbound/characters',
    );
    expect(characters?.children.map((c) => c.slug)).toEqual([
      'the-outbound/characters/dreamers',
      'the-outbound/characters/strivers',
    ]);
  });
});

describe('buildContentTree — synthetic intermediate parents', () => {
  it('inserts a synthetic node when a child has no tracked parent', () => {
    const entries = [
      entry({
        slug: 'the-outbound/characters/strivers',
        title: 'Strivers',
        stage: 'Drafting',
      }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    expect(projects).toHaveLength(1);
    const project = projects[0];
    expect(project.rootSlug).toBe('the-outbound');
    expect(project.totalNodes).toBe(3);
    expect(project.trackedCount).toBe(1);

    const root = project.root;
    expect(root.entry).toBeNull();
    expect(root.lane).toBeNull();
    expect(root.title).toBe('the-outbound');

    const characters = root.children[0];
    expect(characters.entry).toBeNull();
    expect(characters.title).toBe('characters');

    const strivers = characters.children[0];
    expect(strivers.title).toBe('Strivers');
    expect(strivers.lane).toBe('Drafting');
  });
});

describe('buildContentTree — mixed flat + hierarchical', () => {
  it('keeps flat and hierarchical projects independent', () => {
    const entries = [
      entry({ slug: 'whats-in-a-name', title: 'What', stage: 'Published' }),
      entry({ slug: 'the-outbound', title: 'The Outbound', stage: 'Drafting' }),
      entry({
        slug: 'the-outbound/characters',
        title: 'Characters',
        stage: 'Outlining',
      }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    expect(projects.map((p) => p.rootSlug)).toEqual([
      'the-outbound',
      'whats-in-a-name',
    ]);
    const outbound = projects.find((p) => p.rootSlug === 'the-outbound');
    expect(outbound?.totalNodes).toBe(2);
    const flat = projects.find((p) => p.rootSlug === 'whats-in-a-name');
    expect(flat?.totalNodes).toBe(1);
  });
});

describe('buildContentTree — scrapbook aggregation', () => {
  it('aggregates scrapbook count + most-recent mtime per node', () => {
    const entries = [
      entry({
        slug: 'the-outbound/characters/strivers',
        title: 'Strivers',
        stage: 'Drafting',
      }),
    ];
    const lookup: BuildOptions['scrapbookLookup'] = (_site, slug) => {
      if (slug === 'the-outbound/characters/strivers') {
        return {
          items: [
            { mtime: '2026-04-25T12:00:00.000Z' },
            { mtime: '2026-04-26T09:00:00.000Z' },
          ],
          secretItems: [{ mtime: '2026-04-24T08:00:00.000Z' }],
        };
      }
      if (slug === 'the-outbound') {
        return { items: [{ mtime: '2026-04-20T01:00:00.000Z' }], secretItems: [] };
      }
      return { items: [], secretItems: [] };
    };
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: lookup,
    });
    const project = projects[0];
    expect(project.scrapbookCount).toBe(4); // 2 + 1 + 1 across 3 nodes
    const root = project.root;
    expect(root.scrapbookCount).toBe(1);
    expect(root.scrapbookMostRecentMtime).toBe('2026-04-20T01:00:00.000Z');
    const strivers = root.children[0].children[0];
    expect(strivers.scrapbookCount).toBe(3);
    expect(strivers.scrapbookMostRecentMtime).toBe('2026-04-26T09:00:00.000Z');
  });
});

describe('hasOwnIndex', () => {
  // Phase 19a dropped CalendarEntry.filePath. Calendar-driven nodes
  // now always report hasOwnIndex=true (host template default
  // `<slug>/index.md`). Phase 19c rewires this to read the content
  // index for the real on-disk basename.
  it('defaults to true for tracked entries (calendar-only path)', () => {
    const entries = [entry({ slug: 'a', title: 'A', stage: 'Ideas' })];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    expect(projects[0].root.hasOwnIndex).toBe(true);
  });
});

describe('findNode', () => {
  it('returns the node at the given slug', () => {
    const entries = [
      entry({ slug: 'p', title: 'P', stage: 'Drafting' }),
      entry({ slug: 'p/q', title: 'Q', stage: 'Drafting' }),
      entry({ slug: 'p/q/r', title: 'R', stage: 'Drafting' }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    const project = projects[0];
    expect(findNode(project, 'p')?.title).toBe('P');
    expect(findNode(project, 'p/q')?.title).toBe('Q');
    expect(findNode(project, 'p/q/r')?.title).toBe('R');
    expect(findNode(project, 'p/missing')).toBeNull();
  });
});

describe('buildContentTree — organizational README nodes (#24)', () => {
  // The fs-as-primary inversion. A directory with a README.md but no
  // calendar entry should appear as an organizational node in the tree
  // — visible to the operator, but with no lane and no review action.

  const fsWithReadmes: FsWalkEntry[] = [
    { slug: 'the-outbound', hasIndex: true, hasReadme: false, title: 'The Outbound' },
    { slug: 'the-outbound/characters', hasIndex: false, hasReadme: true, title: 'Characters' },
    { slug: 'the-outbound/characters/strivers', hasIndex: true, hasReadme: false, title: 'Strivers' },
    { slug: 'the-outbound/characters/dreamers', hasIndex: false, hasReadme: true, title: 'Dreamers' },
    { slug: 'the-outbound/places', hasIndex: false, hasReadme: true, title: 'Places' },
  ];

  it('surfaces a top-level fs directory with a README as an organizational node', () => {
    // Calendar has only `the-outbound/characters/strivers`. The fs walk
    // contributes the-outbound, /characters, /places as ancestors and
    // organizational siblings.
    const entries = [
      entry({
        slug: 'the-outbound/characters/strivers',
        title: 'Strivers',
        stage: 'Drafting',
      }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fsWithReadmes,
    });
    expect(projects).toHaveLength(1);
    const project = projects[0];
    // 5 fs nodes + 0 ancestor synthetics that aren't already covered
    // = 5 total. (the-outbound, characters, strivers, dreamers, places)
    expect(project.totalNodes).toBe(5);
    expect(project.trackedCount).toBe(1);

    const root = project.root;
    expect(root.slug).toBe('the-outbound');
    // README/index frontmatter title beats leaf-segment fallback.
    expect(root.title).toBe('The Outbound');
    expect(root.entry).toBeNull(); // no calendar entry
    expect(root.lane).toBeNull();
    expect(root.hasFsDir).toBe(true);
    expect(root.hasOwnIndex).toBe(true);

    const characters = root.children.find(
      (c) => c.slug === 'the-outbound/characters',
    );
    expect(characters).toBeDefined();
    expect(characters!.entry).toBeNull();
    expect(characters!.lane).toBeNull();
    expect(characters!.title).toBe('Characters');
    expect(characters!.hasFsDir).toBe(true);
    expect(characters!.hasOwnIndex).toBe(true);

    // Sibling places node — also organizational.
    const places = root.children.find((c) => c.slug === 'the-outbound/places');
    expect(places).toBeDefined();
    expect(places!.entry).toBeNull();
    expect(places!.title).toBe('Places');
  });

  it('lets the calendar overlay win when both calendar and README have a title', () => {
    const entries = [
      entry({
        slug: 'the-outbound/characters',
        title: 'CALENDAR-WINS',
        stage: 'Outlining',
      }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fsWithReadmes,
    });
    const characters = findNode(projects[0], 'the-outbound/characters');
    expect(characters?.title).toBe('CALENDAR-WINS');
    expect(characters?.lane).toBe('Outlining');
  });

  it('renders a deep organizational node when its parent has no calendar entry', () => {
    // No calendar entries at all; the entire tree is organizational.
    const projects = buildContentTree('wc', [], makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fsWithReadmes,
    });
    expect(projects).toHaveLength(1);
    const project = projects[0];
    expect(project.trackedCount).toBe(0);
    expect(project.predominantLane).toBeNull();
    // Tree includes every fs node.
    expect(project.totalNodes).toBeGreaterThanOrEqual(4);
    const dreamers = findNode(project, 'the-outbound/characters/dreamers');
    expect(dreamers).not.toBeNull();
    expect(dreamers?.entry).toBeNull();
    expect(dreamers?.title).toBe('Dreamers');
  });

  it('still includes calendar entries that have no fs directory (calendar is authoritative)', () => {
    // The calendar lists "ghost" — a slug with no on-disk presence.
    // The tree still surfaces it; the studio detail panel will show
    // hasFsDir=false so the README-excerpt path can be skipped.
    const entries = [
      entry({ slug: 'ghost', title: 'Ghost', stage: 'Ideas' }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => [],
    });
    expect(projects).toHaveLength(1);
    const ghost = findNode(projects[0], 'ghost');
    expect(ghost).not.toBeNull();
    expect(ghost?.entry).not.toBeNull();
    expect(ghost?.lane).toBe('Ideas');
    expect(ghost?.hasFsDir).toBe(false);
  });

  it('marks intermediate directories without README as organizational anchors', () => {
    // Operator has an intermediate directory `groups` that has no
    // README and no calendar entry, but its child does. The tree
    // should still place the child correctly (groups becomes a
    // synthetic ancestor without hasFsDir).
    const fs: FsWalkEntry[] = [
      // `groups` itself isn't surfaced — no README, no index — so it
      // doesn't contribute to allSlugs from the fs side. Calendar
      // ancestor walk still covers it.
      { slug: 'groups/strivers', hasIndex: true, hasReadme: false, title: 'Strivers' },
    ];
    const entries = [
      entry({
        slug: 'groups/strivers',
        title: 'Strivers',
        stage: 'Drafting',
      }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
      fsWalk: () => fs,
    });
    const project = projects[0];
    expect(project.rootSlug).toBe('groups');
    const groups = project.root;
    // `groups` is a synthetic ancestor — no calendar entry, no fs entry.
    expect(groups.entry).toBeNull();
    expect(groups.hasFsDir).toBe(false);
    // The leaf still has its tracked entry.
    const strivers = findNode(project, 'groups/strivers');
    expect(strivers?.entry).not.toBeNull();
    expect(strivers?.lane).toBe('Drafting');
  });
});

describe('flattenForRender', () => {
  it('depth-first orders nodes with isLast set on final children', () => {
    const entries = [
      entry({ slug: 'p', title: 'P', stage: 'Drafting' }),
      entry({ slug: 'p/a', title: 'A', stage: 'Drafting' }),
      entry({ slug: 'p/b', title: 'B', stage: 'Drafting' }),
      entry({ slug: 'p/b/x', title: 'X', stage: 'Drafting' }),
    ];
    const projects = buildContentTree('wc', entries, makeConfig(), '/tmp/x', {
      scrapbookLookup: emptyLookup,
    });
    const flat = flattenForRender(projects[0].root);
    expect(flat.map((f) => f.node.slug)).toEqual(['p', 'p/a', 'p/b', 'p/b/x']);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 1, 2]);
    // Root is its own only sibling, so isLast for root = true.
    expect(flat[0].isLast).toBe(true);
    // 'p/a' is first of two children → not last.
    expect(flat[1].isLast).toBe(false);
    // 'p/b' is second / last child of p → last.
    expect(flat[2].isLast).toBe(true);
    // 'p/b/x' is the only child of p/b → last.
    expect(flat[3].isLast).toBe(true);
  });
});
