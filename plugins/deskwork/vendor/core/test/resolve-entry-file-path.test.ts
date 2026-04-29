/**
 * Tests for `resolveEntryFilePath` (Issue #67).
 *
 * The helper centralises UUID-first-then-slug-template precedence for
 * any caller that needs to translate a calendar entry into the markdown
 * file backing it. Mirrors the studio's `resolveLongformFilePath`
 * (`packages/core/src/review/workflow-paths.ts`) but as a top-level
 * export from `paths.ts` so CLI commands don't have to import from
 * `review/`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEntryFilePath } from '../src/paths.ts';
import type { ContentIndex } from '../src/content-index.ts';
import type { DeskworkConfig } from '../src/config.ts';

const cfg: DeskworkConfig = {
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

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deskwork-resolve-entry-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('resolveEntryFilePath', () => {
  it('returns the UUID-bound path when the index has a hit for the entry id', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    // Real fs file at a non-template path — the binding lives in the
    // index, not at <slug>/index.md.
    const abs = join(root, 'src/content/1.0/in-progress/some-feature/prd.md');
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(
      abs,
      `---\ndeskwork:\n  id: ${id}\ntitle: PRD\n---\n\n# PRD\n`,
    );
    const idx: ContentIndex = {
      byId: new Map([[id, abs]]),
      byPath: new Map([['1.0/in-progress/some-feature/prd.md', id]]),
      invalid: [],
    };
    expect(resolveEntryFilePath(root, cfg, 'wc', 'some-feature', id, idx)).toBe(abs);
  });

  it('falls back to the slug-template when no UUID match in the index', () => {
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const result = resolveEntryFilePath(
      root,
      cfg,
      'wc',
      'my-post',
      'no-match-id',
      idx,
    );
    expect(result).toBe(join(root, 'src/content/my-post/index.md'));
  });

  it('falls back to the slug-template when entryId is undefined', () => {
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const result = resolveEntryFilePath(root, cfg, 'wc', 'my-post', undefined, idx);
    expect(result).toBe(join(root, 'src/content/my-post/index.md'));
  });

  it('falls back to the slug-template when entryId is an empty string', () => {
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const result = resolveEntryFilePath(root, cfg, 'wc', 'my-post', '', idx);
    expect(result).toBe(join(root, 'src/content/my-post/index.md'));
  });

  it('builds the index on demand when none is passed', () => {
    const id = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
    const abs = join(root, 'src/content/projects/the-outbound/index.md');
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(
      abs,
      `---\ndeskwork:\n  id: ${id}\ntitle: The Outbound\n---\n\n# The Outbound\n`,
    );
    expect(resolveEntryFilePath(root, cfg, 'wc', 'the-outbound', id)).toBe(abs);
  });

  it('honors the slug-template fallback when the index is built fresh and has no binding', () => {
    // No file written → index is empty → fallback to template path.
    const result = resolveEntryFilePath(
      root,
      cfg,
      'wc',
      'unscaffolded-post',
      'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
    );
    expect(result).toBe(
      join(root, 'src/content/unscaffolded-post/index.md'),
    );
  });

  it('uses the configured blogFilenameTemplate for the fallback', () => {
    const flatCfg: DeskworkConfig = {
      version: 1,
      sites: {
        wc: {
          host: 'wc.example',
          contentDir: 'content',
          calendarPath: 'docs/cal.md',
          blogFilenameTemplate: '{slug}.md',
        },
      },
      defaultSite: 'wc',
    };
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    expect(
      resolveEntryFilePath(root, flatCfg, 'wc', 'flat-post', '', idx),
    ).toBe(join(root, 'content/flat-post.md'));
  });
});
