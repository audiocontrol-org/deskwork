/**
 * Scrapbook tests — addressed by hierarchical path, with public/secret split.
 *
 * Uses real on-disk fixture trees (per the project's testing rule —
 * "Use fixture project trees on disk, never mock the filesystem"); the
 * scrapbook module touches readdirSync/statSync directly, so a mock
 * would just be testing the mock.
 *
 * Post-#192: the public mutation surface is the entry-aware `*AtDir`
 * family. The slug-template fallback is exercised through
 * `scrapbookDirForEntry({ slug })` with no id binding — the legacy
 * `scrapbookDir(slug)` / `scrapbookFilePath(slug)` / slug-template CRUD
 * helpers were collapsed to private internals.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertSlug,
  classify,
  countScrapbook,
  countScrapbookForEntry,
  createScrapbookMarkdownAtDir,
  isNestedSlug,
  listScrapbook,
  readScrapbookFile,
  readScrapbookFileAtDir,
  scrapbookDirAtPath,
  scrapbookDirForEntry,
  scrapbookFilePathAtDir,
  slugSegments,
  SECRET_SUBDIR,
} from '../src/scrapbook.ts';
import type { ContentIndex } from '../src/content-index.ts';
import type { DeskworkConfig } from '../src/config.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'wc.example',
        contentDir: 'src/content/projects',
        calendarPath: 'docs/cal.md',
        blogFilenameTemplate: '{slug}/index.md',
      },
    },
    defaultSite: 'wc',
  };
}

describe('slug helpers', () => {
  it('assertSlug accepts hierarchical paths', () => {
    expect(() => assertSlug('the-outbound')).not.toThrow();
    expect(() => assertSlug('the-outbound/characters')).not.toThrow();
    expect(() => assertSlug('the-outbound/characters/strivers')).not.toThrow();
  });

  it('assertSlug rejects malformed paths', () => {
    expect(() => assertSlug('')).toThrow();
    expect(() => assertSlug('/leading')).toThrow();
    expect(() => assertSlug('trailing/')).toThrow();
    expect(() => assertSlug('double//slash')).toThrow();
    expect(() => assertSlug('UpperCase')).toThrow();
    expect(() => assertSlug('with spaces')).toThrow();
    expect(() => assertSlug('the-outbound/Characters')).toThrow(); // mid-path uppercase
  });

  it('slugSegments splits on /', () => {
    expect(slugSegments('flat')).toEqual(['flat']);
    expect(slugSegments('a/b/c')).toEqual(['a', 'b', 'c']);
  });

  it('isNestedSlug detects hierarchy', () => {
    expect(isNestedSlug('flat')).toBe(false);
    expect(isNestedSlug('a/b')).toBe(true);
  });
});

describe('scrapbookDirForEntry path containment (slug-template fallback)', () => {
  // Post-#192: the slug-template fallback is the legacy path inside
  // `scrapbookDirForEntry`. We exercise it by passing `{ slug }` with no
  // id binding — the resolver falls through to the private slug-template
  // helper.
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('resolves to <contentDir>/<slug>/scrapbook for flat slugs (fallback)', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'flat-piece' });
    expect(dir).toBe(join(root, 'src/content/projects/flat-piece/scrapbook'));
  });

  it('resolves to <contentDir>/<deep-slug>/scrapbook for hierarchical slugs (fallback)', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', {
      slug: 'the-outbound/characters/strivers',
    });
    expect(dir).toBe(
      join(
        root,
        'src/content/projects/the-outbound/characters/strivers/scrapbook',
      ),
    );
  });

  it('scrapbookFilePathAtDir with secret:false returns top-level path', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'pillar' });
    const p = scrapbookFilePathAtDir(dir, 'note.md');
    expect(p).toBe(
      join(root, 'src/content/projects/pillar/scrapbook/note.md'),
    );
  });

  it('scrapbookFilePathAtDir with secret:true joins the secret subdir', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'pillar' });
    const p = scrapbookFilePathAtDir(dir, 'private.md', { secret: true });
    expect(p).toBe(
      join(
        root,
        'src/content/projects/pillar/scrapbook',
        SECRET_SUBDIR,
        'private.md',
      ),
    );
  });

  it('rejects a path-traversal filename', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'pillar' });
    expect(() => scrapbookFilePathAtDir(dir, '../escape.md')).toThrow();
  });
});

describe('listScrapbook public + secret split', () => {
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-list-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns empty when scrapbook does not exist', () => {
    const summary = listScrapbook(root, cfg, 'wc', 'no-scrapbook');
    expect(summary.exists).toBe(false);
    expect(summary.items).toEqual([]);
    expect(summary.secretItems).toEqual([]);
  });

  it('lists top-level files as public items', () => {
    const dir = join(root, 'src/content/projects/pillar/scrapbook');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'README.md'), '# notes');
    writeFileSync(join(dir, 'reference.json'), '{}');
    const summary = listScrapbook(root, cfg, 'wc', 'pillar');
    expect(summary.exists).toBe(true);
    const names = summary.items.map((i) => i.name).sort();
    expect(names).toEqual(['README.md', 'reference.json']);
    expect(summary.secretItems).toEqual([]);
  });

  it('lists files inside scrapbook/secret/ as secret items', () => {
    const sb = join(root, 'src/content/projects/pillar/scrapbook');
    const secret = join(sb, SECRET_SUBDIR);
    mkdirSync(secret, { recursive: true });
    writeFileSync(join(sb, 'public.md'), '# public');
    writeFileSync(join(secret, 'draft.md'), '# secret draft');
    writeFileSync(join(secret, 'sensitive.json'), '{}');
    const summary = listScrapbook(root, cfg, 'wc', 'pillar');
    expect(summary.items.map((i) => i.name)).toEqual(['public.md']);
    const secretNames = summary.secretItems.map((i) => i.name).sort();
    expect(secretNames).toEqual(['draft.md', 'sensitive.json']);
  });

  it('does NOT count secret/ as a top-level item', () => {
    const sb = join(root, 'src/content/projects/pillar/scrapbook');
    mkdirSync(join(sb, SECRET_SUBDIR), { recursive: true });
    writeFileSync(join(sb, 'public.md'), '#');
    const summary = listScrapbook(root, cfg, 'wc', 'pillar');
    expect(summary.items.map((i) => i.name)).toEqual(['public.md']);
  });

  it('ignores other subdirectories at the top level', () => {
    const sb = join(root, 'src/content/projects/pillar/scrapbook');
    mkdirSync(join(sb, 'archive'), { recursive: true });
    writeFileSync(join(sb, 'archive', 'old.md'), '#');
    writeFileSync(join(sb, 'kept.md'), '#');
    const summary = listScrapbook(root, cfg, 'wc', 'pillar');
    expect(summary.items.map((i) => i.name)).toEqual(['kept.md']);
  });

  it('addresses scrapbooks at hierarchical paths', () => {
    const dir = join(
      root,
      'src/content/projects/the-outbound/characters/scrapbook',
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'archetypes.md'), '#');
    const summary = listScrapbook(
      root,
      cfg,
      'wc',
      'the-outbound/characters',
    );
    expect(summary.exists).toBe(true);
    expect(summary.items.map((i) => i.name)).toEqual(['archetypes.md']);
  });
});

describe('countScrapbook', () => {
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-count-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('counts public + secret items together', () => {
    const sb = join(root, 'src/content/projects/p/scrapbook');
    const secret = join(sb, SECRET_SUBDIR);
    mkdirSync(secret, { recursive: true });
    writeFileSync(join(sb, 'a.md'), '#');
    writeFileSync(join(sb, 'b.md'), '#');
    writeFileSync(join(secret, 'c.md'), '#');
    expect(countScrapbook(root, cfg, 'wc', 'p')).toBe(3);
  });

  it('returns 0 for non-existent scrapbook', () => {
    expect(countScrapbook(root, cfg, 'wc', 'p')).toBe(0);
  });
});

describe('createScrapbookMarkdownAtDir with secret flag', () => {
  // Post-#192: callers compose `scrapbookDirForEntry({ slug })` (or the
  // entry-aware variant) with `createScrapbookMarkdownAtDir`. The
  // slug-template variant of create is no longer public — these tests
  // exercise the same code path through the supported surface.
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-scrapbook-create-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates a public file at scrapbook/<filename> by default', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'p' });
    createScrapbookMarkdownAtDir(dir, 'public-note.md', '# public');
    const summary = listScrapbook(root, cfg, 'wc', 'p');
    expect(summary.items.map((i) => i.name)).toEqual(['public-note.md']);
    expect(summary.secretItems).toEqual([]);
  });

  it('creates a secret file at scrapbook/secret/<filename> when secret:true', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'p' });
    createScrapbookMarkdownAtDir(dir, 'private-note.md', '# private', {
      secret: true,
    });
    const summary = listScrapbook(root, cfg, 'wc', 'p');
    expect(summary.items).toEqual([]);
    expect(summary.secretItems.map((i) => i.name)).toEqual(['private-note.md']);
  });

  it('readScrapbookFile finds a secret file via the secret flag', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'p' });
    createScrapbookMarkdownAtDir(dir, 'private.md', '# private body', {
      secret: true,
    });
    // Reading without the flag fails (looks at the public path)
    expect(() => readScrapbookFile(root, cfg, 'wc', 'p', 'private.md')).toThrow();
    // With the flag, it resolves
    const f = readScrapbookFile(root, cfg, 'wc', 'p', 'private.md', {
      secret: true,
    });
    expect(f.content.toString('utf-8')).toBe('# private body');
  });

  it('readScrapbookFileAtDir mirrors the slug-keyed read primitive', () => {
    // The public dir-keyed read primitive — used by callers that have
    // already resolved the dir via `scrapbookDirForEntry`.
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'q' });
    createScrapbookMarkdownAtDir(dir, 'note.md', '# body');
    const f = readScrapbookFileAtDir(dir, 'note.md');
    expect(f.content.toString('utf-8')).toBe('# body');
  });
});

describe('classify (existing behavior, unchanged)', () => {
  it('buckets by extension', () => {
    expect(classify('a.md')).toBe('md');
    expect(classify('a.markdown')).toBe('md');
    expect(classify('a.json')).toBe('json');
    expect(classify('a.png')).toBe('img');
    expect(classify('a.txt')).toBe('txt');
    expect(classify('a.unknown')).toBe('other');
  });
});

describe('scrapbookDirAtPath (Phase 19c)', () => {
  // Path-addressed sibling of the legacy slug resolver — used when the
  // studio already knows the fs path of an organizational/tracked node
  // and doesn't need to re-derive through the slug regex.
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sb-at-path-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('joins contentDir + relPath + scrapbook for flat paths', () => {
    expect(scrapbookDirAtPath(root, cfg, 'wc', 'flat')).toBe(
      join(root, 'src/content/projects/flat/scrapbook'),
    );
  });

  it('handles hierarchical paths', () => {
    expect(
      scrapbookDirAtPath(root, cfg, 'wc', 'projects/the-outbound'),
    ).toBe(
      join(root, 'src/content/projects/projects/the-outbound/scrapbook'),
    );
  });

  it('rejects path-traversal shapes', () => {
    expect(() => scrapbookDirAtPath(root, cfg, 'wc', '../escape')).toThrow();
  });
});

describe('scrapbookDirForEntry (Phase 19c)', () => {
  // Resolves the scrapbook from the entry's bound file location (via
  // content index) so refactoring the directory tree updates the
  // scrapbook address automatically. Falls back to slug-template for
  // pre-doctor entries.
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sb-for-entry-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('uses the bound file path from the content index', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const abs = join(root, 'src/content/projects/projects/the-outbound/index.md');
    const idx: ContentIndex = {
      byId: new Map([[id, abs]]),
      byPath: new Map([['projects/the-outbound/index.md', id]]),
      invalid: [],
    };
    const dir = scrapbookDirForEntry(
      root,
      cfg,
      'wc',
      { id, slug: 'the-outbound' },
      idx,
    );
    expect(dir).toBe(
      join(root, 'src/content/projects/projects/the-outbound/scrapbook'),
    );
  });

  it('falls back to slug-template path when no id binding exists', () => {
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const dir = scrapbookDirForEntry(
      root,
      cfg,
      'wc',
      { slug: 'my-post' },
      idx,
    );
    // Template defaults to <slug>/index.md → scrapbook lives at
    // <slug>/scrapbook.
    expect(dir).toBe(join(root, 'src/content/projects/my-post/scrapbook'));
  });

  it('builds the index on demand when none is passed', () => {
    // Real fixture: write a file with frontmatter id, let the helper
    // walk and resolve.
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const abs = join(root, 'src/content/projects/projects/the-outbound/index.md');
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, `---\ndeskwork:\n  id: ${id}\ntitle: The Outbound\n---\n`);
    const dir = scrapbookDirForEntry(root, cfg, 'wc', {
      id,
      slug: 'the-outbound',
    });
    expect(dir).toBe(
      join(root, 'src/content/projects/projects/the-outbound/scrapbook'),
    );
  });
});

describe('countScrapbookForEntry (issue #34)', () => {
  // The slug-template path is wrong for writingcontrol-shape entries
  // whose file lives at <contentDir>/projects/<slug>/index.md (extra
  // `projects/` segment, slug doesn't bake the path). The entry-aware
  // counter walks the content index first so the chip reflects the
  // actual on-disk scrapbook directory.
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sb-count-for-entry-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('counts items at the index-resolved directory (id-bound entry)', () => {
    // Calendar slug `the-outbound` but file lives at
    // <contentDir>/projects/the-outbound/index.md. Scrapbook items
    // sit next to the file under projects/the-outbound/scrapbook/.
    const id = '11111111-2222-4333-8444-555555555555';
    const fileAbs = join(
      root,
      'src/content/projects/projects/the-outbound/index.md',
    );
    const sb = join(
      root,
      'src/content/projects/projects/the-outbound/scrapbook',
    );
    const secret = join(sb, SECRET_SUBDIR);
    mkdirSync(secret, { recursive: true });
    writeFileSync(fileAbs, `---\ndeskwork:\n  id: ${id}\ntitle: The Outbound\n---\n`);
    writeFileSync(join(sb, 'README.md'), '# notes');
    writeFileSync(join(sb, 'reference.json'), '{}');
    writeFileSync(join(secret, 'draft.md'), '# secret');

    const idx: ContentIndex = {
      byId: new Map([[id, fileAbs]]),
      byPath: new Map([['projects/the-outbound/index.md', id]]),
      invalid: [],
    };

    const n = countScrapbookForEntry(
      root,
      cfg,
      'wc',
      { id, slug: 'the-outbound' },
      idx,
    );
    expect(n).toBe(3);
    // Sanity check — the slug-only counter looks at the wrong path
    // and returns 0. This is the bug being fixed.
    expect(countScrapbook(root, cfg, 'wc', 'the-outbound')).toBe(0);
  });

  it('falls back to slug-template path for entries without an id binding', () => {
    // Pre-doctor entry (no id). The slug-template path is the only
    // signal we have; the helper should mirror countScrapbook's
    // behavior in that case.
    const sb = join(root, 'src/content/projects/legacy/scrapbook');
    mkdirSync(sb, { recursive: true });
    writeFileSync(join(sb, 'a.md'), '#');
    writeFileSync(join(sb, 'b.md'), '#');

    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const n = countScrapbookForEntry(
      root,
      cfg,
      'wc',
      { slug: 'legacy' },
      idx,
    );
    expect(n).toBe(2);
  });

  it('returns 0 when the resolved directory does not exist', () => {
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const n = countScrapbookForEntry(
      root,
      cfg,
      'wc',
      { slug: 'no-such-thing' },
      idx,
    );
    expect(n).toBe(0);
  });
});

describe('public surface (#192) — slug-template helpers are no longer exported', () => {
  // Regression coverage for #192: callers must reach the slug-template
  // path through `scrapbookDirForEntry({ slug })` (which falls back
  // internally) — never through a direct slug-template helper.
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sb-public-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('scrapbookDirForEntry({ slug }) round-trips create + list', () => {
    const dir = scrapbookDirForEntry(root, cfg, 'wc', { slug: 'p' });
    createScrapbookMarkdownAtDir(dir, 'note.md', '# hi');
    const summary = listScrapbook(root, cfg, 'wc', 'p');
    expect(summary.items.map((i) => i.name)).toEqual(['note.md']);
  });

  it('the entry-aware path is used when an id binding exists', () => {
    // Same slug, but the entry binds to a deeper path on disk. The
    // entry-aware resolver should walk to the bound file's parent dir;
    // the slug-template fallback would point at the wrong location.
    const id = 'cccccccc-dddd-4eee-8fff-000000000000';
    const fileAbs = join(
      root,
      'src/content/projects/team/blog/the-outbound/index.md',
    );
    mkdirSync(join(fileAbs, '..'), { recursive: true });
    writeFileSync(
      fileAbs,
      `---\ndeskwork:\n  id: ${id}\ntitle: The Outbound\n---\n`,
    );
    const dir = scrapbookDirForEntry(root, cfg, 'wc', {
      id,
      slug: 'the-outbound',
    });
    // The bound file's parent dir + scrapbook — NOT
    // <contentDir>/the-outbound/scrapbook.
    expect(dir).toBe(
      join(root, 'src/content/projects/team/blog/the-outbound/scrapbook'),
    );
  });
});
