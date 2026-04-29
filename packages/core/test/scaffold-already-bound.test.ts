/**
 * Tests for the scaffold duplicate-binding preflight (Issue #66).
 *
 * Before the fix, `scaffoldBlogPost` only checked whether the slug-
 * template path was occupied. If a calendar entry had already been
 * bound (via `deskwork.id` frontmatter) to a file at a *different*
 * on-disk path — which happens any time `outline` runs after `ingest`,
 * or for hierarchical layouts where the slug doesn't map 1:1 to the
 * fs path — the slug-template check would pass and a parallel file
 * would be scaffolded sharing the same `deskwork.id` UUID. Doctor
 * then flagged `duplicate-id`.
 *
 * The fix: consult the content index for an existing binding to the
 * entry's id BEFORE picking a target path, and refuse to scaffold a
 * parallel file with an actionable error message.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldBlogPost } from '../src/scaffold.ts';
import { buildContentIndex } from '../src/content-index.ts';
import type { DeskworkConfig } from '../src/config.ts';
import type { CalendarEntry } from '../src/types.ts';

const FIXED_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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
    author: 'Author',
  };
}

function makeEntry(overrides?: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: FIXED_ID,
    slug: 'my-feature',
    title: 'My Feature',
    description: 'desc',
    stage: 'Planned',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-bound-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('scaffoldBlogPost — duplicate-binding refusal (Issue #66)', () => {
  it('refuses to scaffold when the entry id is already bound to a file elsewhere under contentDir', () => {
    // Lay down an existing file at a non-template path that already
    // declares `deskwork.id: FIXED_ID`. This simulates the post-ingest
    // state: the entry's binding lives at `1.0/in-progress/my-feature/prd.md`,
    // not at the slug template's `my-feature/index.md`.
    const existing = join(
      root,
      'src/content/1.0/in-progress/my-feature/prd.md',
    );
    mkdirSync(join(existing, '..'), { recursive: true });
    writeFileSync(
      existing,
      `---\ndeskwork:\n  id: ${FIXED_ID}\ntitle: PRD\n---\n\n# PRD\n`,
    );

    const index = buildContentIndex(root, makeConfig(), 'wc');
    expect(index.byId.get(FIXED_ID)).toBe(existing);

    expect(() =>
      scaffoldBlogPost(root, makeConfig(), 'wc', makeEntry(), { index }),
    ).toThrow(/already bound to file at/);

    // The pre-existing file is untouched.
    expect(existsSync(existing)).toBe(true);
    // The slug-template path was NOT scaffolded.
    expect(
      existsSync(join(root, 'src/content/my-feature/index.md')),
    ).toBe(false);
  });

  it('error message names the existing path so the operator knows which file owns the binding', () => {
    const existing = join(
      root,
      'src/content/1.0/in-progress/my-feature/prd.md',
    );
    mkdirSync(join(existing, '..'), { recursive: true });
    writeFileSync(
      existing,
      `---\ndeskwork:\n  id: ${FIXED_ID}\n---\n\n# Body\n`,
    );

    const index = buildContentIndex(root, makeConfig(), 'wc');

    expect(() =>
      scaffoldBlogPost(root, makeConfig(), 'wc', makeEntry(), { index }),
    ).toThrow(/1\.0\/in-progress\/my-feature\/prd\.md/);
  });

  it('builds the content index automatically when no index hint is passed', () => {
    const existing = join(
      root,
      'src/content/elsewhere/feature/index.md',
    );
    mkdirSync(join(existing, '..'), { recursive: true });
    writeFileSync(
      existing,
      `---\ndeskwork:\n  id: ${FIXED_ID}\n---\n\n# Body\n`,
    );

    expect(() =>
      scaffoldBlogPost(root, makeConfig(), 'wc', makeEntry()),
    ).toThrow(/already bound/);
  });

  it('succeeds normally when there is no existing binding for the entry id', () => {
    // Empty content tree — no pre-existing files claiming this id.
    const result = scaffoldBlogPost(
      root,
      makeConfig(),
      'wc',
      makeEntry(),
    );
    expect(existsSync(result.filePath)).toBe(true);
    expect(result.filePath).toBe(
      join(root, 'src/content/my-feature/index.md'),
    );
  });

  it('does not flag unrelated entries — the index check is per-id, not per-slug', () => {
    // A different file (different id) sits where the slug-template
    // would land. The duplicate-binding check is keyed on the entry id,
    // so it should NOT trip; the existing-file check at the target
    // path picks up the conflict instead.
    const otherId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const existing = join(
      root,
      'src/content/somewhere-else/index.md',
    );
    mkdirSync(join(existing, '..'), { recursive: true });
    writeFileSync(
      existing,
      `---\ndeskwork:\n  id: ${otherId}\n---\n\n# Body\n`,
    );

    // Different entry (different id, different slug) scaffolds cleanly.
    const result = scaffoldBlogPost(
      root,
      makeConfig(),
      'wc',
      makeEntry({ slug: 'fresh-entry' }),
    );
    expect(existsSync(result.filePath)).toBe(true);
  });
});
