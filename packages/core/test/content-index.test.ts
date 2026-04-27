/**
 * content-index tests — fixture-based fs walks.
 *
 * Mirrors the project's testing convention: real on-disk fixture trees
 * created via `mkdtempSync(tmpdir(), …)`, no fs mocking. Each test
 * builds the shape it needs, runs `buildContentIndex`, asserts on the
 * returned maps, and cleans up.
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
import { buildContentIndex } from '../src/content-index.ts';
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

/**
 * Write a markdown fixture under `<root>/src/content/projects/<rel>`.
 *
 * Issue #38: deskwork's binding key lives at `deskwork.id` (a nested
 * mapping). Test fixtures pass `id` as the canonical knob; the helper
 * renders it as a `deskwork:` block in the generated YAML so the
 * content index actually picks it up. Pass `topLevelId` when you need
 * to test legacy v0.7.0/v0.7.1 shapes that put `id:` at the top level.
 */
interface FixtureFrontmatter {
  /** Value to write under `deskwork.id` (the canonical binding). */
  id?: string;
  /** Value to write at the top level — legacy / operator's keyspace. */
  topLevelId?: string;
  title?: string;
  /** Other arbitrary keys to render verbatim. */
  extra?: Record<string, string>;
}

function writeMd(
  root: string,
  rel: string,
  data: FixtureFrontmatter | null,
  body: string,
): string {
  const abs = join(root, 'src/content/projects', rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  if (data === null) {
    writeFileSync(abs, body);
    return abs;
  }
  const lines: string[] = [];
  if (data.id !== undefined) {
    lines.push('deskwork:');
    lines.push(`  id: ${data.id}`);
  }
  if (data.topLevelId !== undefined) {
    lines.push(`id: ${data.topLevelId}`);
  }
  if (data.title !== undefined) {
    lines.push(`title: ${data.title}`);
  }
  if (data.extra) {
    for (const [k, v] of Object.entries(data.extra)) {
      lines.push(`${k}: ${v}`);
    }
  }
  writeFileSync(abs, `---\n${lines.join('\n')}\n---\n${body}`);
  return abs;
}

describe('buildContentIndex', () => {
  let root: string;
  const cfg = makeConfig();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-content-index-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns empty maps when contentDir does not exist', () => {
    // No mkdir for contentDir — directory is intentionally absent.
    const idx = buildContentIndex(root, cfg, 'wc');
    expect(idx.byId.size).toBe(0);
    expect(idx.byPath.size).toBe(0);
    expect(idx.invalid).toEqual([]);
  });

  it('returns empty maps when contentDir exists but is empty', () => {
    mkdirSync(join(root, 'src/content/projects'), { recursive: true });
    const idx = buildContentIndex(root, cfg, 'wc');
    expect(idx.byId.size).toBe(0);
    expect(idx.byPath.size).toBe(0);
    expect(idx.invalid).toEqual([]);
  });

  it('indexes valid frontmatter ids; omits files without id; flags malformed ids', () => {
    const id1 = '11111111-1111-4111-8111-111111111111';
    const id2 = '22222222-2222-4222-8222-222222222222';
    const id3 = '33333333-3333-4333-8333-333333333333';

    writeMd(root, 'a/index.md', { id: id1, title: 'A' }, '\n# A\n');
    writeMd(root, 'b/index.md', { id: id2, title: 'B' }, '\n# B\n');
    writeMd(root, 'c/index.md', { id: id3, title: 'C' }, '\n# C\n');
    // Pre-bind file: no `deskwork.id:` at all. Should NOT appear in invalid.
    writeMd(root, 'd/index.md', { title: 'D' }, '\n# D\n');
    // Malformed id — namespaced block present but the id isn't a UUID.
    writeMd(root, 'e/index.md', { id: 'not-a-uuid', title: 'E' }, '\n# E\n');

    const idx = buildContentIndex(root, cfg, 'wc');

    expect(idx.byId.size).toBe(3);
    expect(idx.byId.get(id1)).toBe(
      join(root, 'src/content/projects/a/index.md'),
    );
    expect(idx.byId.get(id2)).toBe(
      join(root, 'src/content/projects/b/index.md'),
    );
    expect(idx.byId.get(id3)).toBe(
      join(root, 'src/content/projects/c/index.md'),
    );

    expect(idx.byPath.size).toBe(3);
    expect(idx.byPath.get(join('a', 'index.md'))).toBe(id1);
    expect(idx.byPath.get(join('b', 'index.md'))).toBe(id2);
    expect(idx.byPath.get(join('c', 'index.md'))).toBe(id3);
    expect(idx.byPath.get(join('d', 'index.md'))).toBeUndefined();

    expect(idx.invalid).toHaveLength(1);
    expect(idx.invalid[0].absolutePath).toBe(
      join(root, 'src/content/projects/e/index.md'),
    );
    expect(idx.invalid[0].reason).toMatch(/UUID/);
  });

  it('skips scrapbook/, node_modules/, dist/, and dotfiles', () => {
    const idGood = '44444444-4444-4444-8444-444444444444';
    const idScrap = '55555555-5555-4555-8555-555555555555';
    const idNm = '66666666-6666-4666-8666-666666666666';
    const idDist = '77777777-7777-4777-8777-777777777777';
    const idHidden = '88888888-8888-4888-8888-888888888888';

    writeMd(root, 'real/index.md', { id: idGood, title: 'Real' }, '\n');
    writeMd(root, 'real/scrapbook/note.md', { id: idScrap, title: 'Scrap' }, '\n');
    writeMd(root, 'node_modules/dep/readme.md', { id: idNm, title: 'NM' }, '\n');
    writeMd(root, 'dist/build.md', { id: idDist, title: 'Dist' }, '\n');
    writeMd(root, '.hidden/secret.md', { id: idHidden, title: 'Hidden' }, '\n');

    const idx = buildContentIndex(root, cfg, 'wc');

    expect(idx.byId.size).toBe(1);
    expect(idx.byId.has(idGood)).toBe(true);
    expect(idx.byId.has(idScrap)).toBe(false);
    expect(idx.byId.has(idNm)).toBe(false);
    expect(idx.byId.has(idDist)).toBe(false);
    expect(idx.byId.has(idHidden)).toBe(false);
    expect(idx.invalid).toEqual([]);
  });

  it('walks hierarchical paths at multiple depths', () => {
    const idEssay = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const idProject = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const idNested = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    writeMd(root, 'essays/foo/index.md', { id: idEssay, title: 'Foo' }, '\n');
    writeMd(
      root,
      'projects/the-outbound/index.md',
      { id: idProject, title: 'Outbound' },
      '\n',
    );
    writeMd(
      root,
      'projects/the-outbound/characters/strivers/index.md',
      { id: idNested, title: 'Strivers' },
      '\n',
    );

    const idx = buildContentIndex(root, cfg, 'wc');

    expect(idx.byId.size).toBe(3);
    expect(idx.byPath.get(join('essays', 'foo', 'index.md'))).toBe(idEssay);
    expect(idx.byPath.get(join('projects', 'the-outbound', 'index.md'))).toBe(
      idProject,
    );
    expect(
      idx.byPath.get(
        join('projects', 'the-outbound', 'characters', 'strivers', 'index.md'),
      ),
    ).toBe(idNested);
  });

  it('indexes .mdx and .markdown files alongside .md', () => {
    const idMdx = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const idMarkdown = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const idMd = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    writeMd(root, 'a/index.mdx', { id: idMdx, title: 'A' }, '\n');
    writeMd(root, 'b/README.markdown', { id: idMarkdown, title: 'B' }, '\n');
    writeMd(root, 'c/index.md', { id: idMd, title: 'C' }, '\n');

    const idx = buildContentIndex(root, cfg, 'wc');
    expect(idx.byId.size).toBe(3);
    expect(idx.byId.has(idMdx)).toBe(true);
    expect(idx.byId.has(idMarkdown)).toBe(true);
    expect(idx.byId.has(idMd)).toBe(true);
  });

  it('on duplicate ids, byId keeps the first encountered (sorted-walk deterministic); byPath keeps both', () => {
    const dup = '12345678-1234-4234-8234-123456789012';
    // Sorted absolute path order will visit `a/index.md` before `z/index.md`.
    writeMd(root, 'a/index.md', { id: dup, title: 'First' }, '\n');
    writeMd(root, 'z/index.md', { id: dup, title: 'Second' }, '\n');

    const idx = buildContentIndex(root, cfg, 'wc');

    expect(idx.byId.size).toBe(1);
    expect(idx.byId.get(dup)).toBe(
      join(root, 'src/content/projects/a/index.md'),
    );
    // Both paths point at the same uuid in byPath.
    expect(idx.byPath.size).toBe(2);
    expect(idx.byPath.get(join('a', 'index.md'))).toBe(dup);
    expect(idx.byPath.get(join('z', 'index.md'))).toBe(dup);
    // Duplicates aren't reported in `invalid` — that's a separate
    // doctor rule's responsibility, not the index's.
    expect(idx.invalid).toEqual([]);
  });

  it('treats empty-string id as invalid', () => {
    writeMd(root, 'a/index.md', { id: '""', title: 'A' }, '\n');
    const idx = buildContentIndex(root, cfg, 'wc');
    expect(idx.byId.size).toBe(0);
    expect(idx.invalid).toHaveLength(1);
    expect(idx.invalid[0].reason).toMatch(/empty|UUID/i);
  });

  it('treats numeric id as invalid', () => {
    writeMd(root, 'a/index.md', { id: '42', title: 'A' }, '\n');
    const idx = buildContentIndex(root, cfg, 'wc');
    expect(idx.byId.size).toBe(0);
    expect(idx.invalid).toHaveLength(1);
  });

  // Issue #38 — namespacing
  describe('Issue #38: deskwork-namespaced id reads', () => {
    it('indexes files with `deskwork.id` populated', () => {
      const id = '99999999-9999-4999-8999-999999999999';
      writeMd(root, 'a/index.md', { id, title: 'A' }, '\n# A\n');
      const idx = buildContentIndex(root, cfg, 'wc');
      expect(idx.byId.get(id)).toBe(
        join(root, 'src/content/projects/a/index.md'),
      );
      expect(idx.invalid).toEqual([]);
    });

    it('does NOT index files with only a top-level `id:` (legacy state)', () => {
      const id = '88888888-8888-4888-8888-888888888888';
      writeMd(root, 'a/index.md', { topLevelId: id, title: 'A' }, '\n# A\n');
      const idx = buildContentIndex(root, cfg, 'wc');
      // Top-level id belongs to the operator's keyspace post-#38; the
      // legacy-top-level-id-migration doctor rule surfaces these files
      // for migration. The index treats them as pre-bind.
      expect(idx.byId.size).toBe(0);
      expect(idx.invalid).toEqual([]);
    });

    it('treats malformed `deskwork.id` (non-UUID string) as invalid', () => {
      writeMd(
        root,
        'a/index.md',
        { id: 'not-a-uuid', title: 'A' },
        '\n# A\n',
      );
      const idx = buildContentIndex(root, cfg, 'wc');
      expect(idx.byId.size).toBe(0);
      expect(idx.invalid).toHaveLength(1);
      expect(idx.invalid[0].reason).toMatch(/UUID/);
    });

    it('prefers `deskwork.id` even when a top-level `id:` is also present', () => {
      const namespaced = '11111111-2222-4333-8444-555555555555';
      const topLevel = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      writeMd(
        root,
        'a/index.md',
        { id: namespaced, topLevelId: topLevel, title: 'A' },
        '\n# A\n',
      );
      const idx = buildContentIndex(root, cfg, 'wc');
      expect(idx.byId.get(namespaced)).toBe(
        join(root, 'src/content/projects/a/index.md'),
      );
      expect(idx.byId.has(topLevel)).toBe(false);
    });
  });
});
