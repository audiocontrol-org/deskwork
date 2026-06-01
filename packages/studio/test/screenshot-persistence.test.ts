/**
 * Phase 8 Step 8.3.3 — direct tests for the screenshot persistence
 * helpers (filename validation + path resolution).
 *
 * Route-level integration tests live in `entry-screenshot-route.test.ts`;
 * this file pins the filename-validation contract + path resolution
 * shape in isolation so future refactors can't silently weaken the
 * guards.
 */

import { describe, it, expect } from 'vitest';
import {
  assertSafeScreenshotFilename,
  entryScreenshotsDir,
  orphanScreenshotsDir,
} from '../src/lib/screenshot-persistence.ts';
import type { Entry } from '@deskwork/core/schema/entry';

function entryFixture(overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    slug: 'foo',
    title: 'foo',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1 },
    artifactPath: 'docs/foo/index.md',
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('assertSafeScreenshotFilename', () => {
  it('accepts a valid entry-anchored filename (commentId-prefixed)', () => {
    expect(() =>
      assertSafeScreenshotFilename(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-2026-05-31T15-32-04-500Z.png',
      ),
    ).not.toThrow();
  });

  it('accepts a valid orphan filename (timestamp-hash)', () => {
    expect(() =>
      assertSafeScreenshotFilename('2026-05-31T15-32-04-500Z-deadbeef.png'),
    ).not.toThrow();
  });

  it('rejects a filename with a forward slash', () => {
    expect(() => assertSafeScreenshotFilename('foo/bar.png')).toThrow(
      /filename/,
    );
  });

  it('rejects a filename with a backslash', () => {
    expect(() => assertSafeScreenshotFilename('foo\\bar.png')).toThrow(
      /filename/,
    );
  });

  it('rejects a filename with a parent-dir hop', () => {
    expect(() => assertSafeScreenshotFilename('../etc/passwd.png')).toThrow(
      /filename/,
    );
  });

  it('rejects a filename starting with a dot', () => {
    expect(() => assertSafeScreenshotFilename('.hidden.png')).toThrow(
      /filename/,
    );
  });

  it('rejects a filename without the .png extension', () => {
    expect(() => assertSafeScreenshotFilename('foo.jpg')).toThrow(/filename/);
  });

  it('rejects the empty string', () => {
    expect(() => assertSafeScreenshotFilename('')).toThrow(/required/);
  });

  it('rejects extremely long filenames', () => {
    const long = `${'a'.repeat(250)}.png`;
    expect(() => assertSafeScreenshotFilename(long)).toThrow(/too long/);
  });

  it('rejects null / undefined / non-string inputs by throwing', () => {
    // The route handler guards before calling this, but the helper
    // itself enforces the type so the assertion can't be bypassed.
    const cases: unknown[] = [null, undefined, 123, {}, []];
    for (const v of cases) {
      // The function signature is `(filename: string) => void`; we
      // pass the unknown via a function indirection so the test still
      // type-checks. The runtime assertion fires inside the helper.
      expect(() => {
        const fn: (x: unknown) => void = assertSafeScreenshotFilename as unknown as (
          x: unknown,
        ) => void;
        fn(v);
      }).toThrow();
    }
  });
});

describe('entryScreenshotsDir', () => {
  it('resolves to <entryDir>/scrapbook/screenshots for an index.md-canonical entry', () => {
    const dir = entryScreenshotsDir('/proj', entryFixture());
    expect(dir).toBe('/proj/docs/foo/scrapbook/screenshots');
  });

  it('resolves under <scrapbook-dir>/screenshots for legacy <dir>/scrapbook/<file>.md layouts', () => {
    const entry = entryFixture({
      artifactPath: 'docs/foo/scrapbook/legacy.md',
    });
    const dir = entryScreenshotsDir('/proj', entry);
    expect(dir).toBe('/proj/docs/foo/scrapbook/screenshots');
  });

  it('respects a non-default contentDir / slug shape', () => {
    const entry = entryFixture({
      slug: 'my-entry',
      artifactPath: 'content/posts/my-entry/index.md',
    });
    const dir = entryScreenshotsDir('/proj', entry);
    expect(dir).toBe('/proj/content/posts/my-entry/scrapbook/screenshots');
  });
});

describe('orphanScreenshotsDir', () => {
  it('resolves to <projectRoot>/.deskwork/screenshots-orphan', () => {
    expect(orphanScreenshotsDir('/proj')).toBe(
      '/proj/.deskwork/screenshots-orphan',
    );
  });
});
