/**
 * Regression coverage for AUDIT-20260603-11 (Phase 39 Task 39.1).
 *
 * The sites→lanes migration (`dropSitesBlock`) rewrites a project's
 * `.deskwork/config.json` with the `sites` / `defaultSite` block removed.
 * Before this fix, `parseConfig` / `readConfig` REQUIRED a non-empty
 * `sites` block, so a migrated project threw a Zod-style validation error
 * on the very next config read — bricking every config-reading command
 * (`install`, `studio`, `ingest`, `doctor`).
 *
 * Per Option D discipline (HIGH finding), this file carries BOTH:
 *   - the BUG-REPRO test: a migrated config WITHOUT `sites` must load; and
 *   - the REGRESSION-LOCK test: a legacy config WITH `sites` must still
 *     parse exactly as before (the fix must not loosen validation for
 *     configs that DO declare sites).
 */

import { describe, it, expect } from 'vitest';
import { parseConfig } from '@/config';

describe('AUDIT-20260603-11 — parseConfig tolerates a missing sites block (bug repro)', () => {
  it('loads a migrated config that has NO sites block', () => {
    // The exact shape `dropSitesBlock` leaves on disk: version preserved,
    // sites + defaultSite removed, other top-level keys kept verbatim.
    const migrated = {
      version: 1,
      author: 'Jane Doe',
      reviewJournalDir: '.deskwork/review-journal',
    };
    const config = parseConfig(migrated);
    expect(config.version).toBe(1);
    expect(config.sites).toEqual({});
    expect(config.author).toBe('Jane Doe');
    expect(config.reviewJournalDir).toBe('.deskwork/review-journal');
  });

  it('loads a migrated config carrying ONLY version (minimal post-drop shape)', () => {
    const config = parseConfig({ version: 1 });
    expect(config.sites).toEqual({});
  });

  it('loads a config whose sites block is present but empty', () => {
    const config = parseConfig({ version: 1, sites: {} });
    expect(config.sites).toEqual({});
  });
});

describe('AUDIT-20260603-11 — regression lock: a config WITH sites still parses unchanged', () => {
  it('parses a single-site legacy config exactly as before (defaultSite inferred)', () => {
    const legacy = {
      version: 1,
      sites: {
        blog: {
          contentDir: 'src/content/blog',
          calendarPath: '.deskwork/calendar.md',
          host: 'blog.example.com',
        },
      },
    };
    const config = parseConfig(legacy);
    expect(Object.keys(config.sites)).toEqual(['blog']);
    expect(config.sites.blog.contentDir).toBe('src/content/blog');
    expect(config.sites.blog.calendarPath).toBe('.deskwork/calendar.md');
    expect(config.sites.blog.host).toBe('blog.example.com');
    // Single site → defaultSite inferred.
    expect(config.defaultSite).toBe('blog');
  });

  it('parses a multi-site legacy config with explicit defaultSite', () => {
    const legacy = {
      version: 1,
      sites: {
        blog: { contentDir: 'src/content/blog', calendarPath: '.deskwork/calendar.md' },
        docs: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'docs',
    };
    const config = parseConfig(legacy);
    expect(Object.keys(config.sites).sort()).toEqual(['blog', 'docs']);
    expect(config.defaultSite).toBe('docs');
  });

  it('still rejects a site missing required contentDir/calendarPath', () => {
    expect(() =>
      parseConfig({
        version: 1,
        sites: { blog: { calendarPath: '.deskwork/calendar.md' } },
      }),
    ).toThrow(/contentDir/);
  });

  it('still rejects an unknown top-level key', () => {
    expect(() => parseConfig({ version: 1, bogus: true })).toThrow(/unknown key "bogus"/);
  });

  it('still rejects a non-string defaultSite that does not match a configured site', () => {
    expect(() =>
      parseConfig({
        version: 1,
        sites: { blog: { contentDir: 'b', calendarPath: 'c' } },
        defaultSite: 'nope',
      }),
    ).toThrow(/defaultSite "nope" is not a configured site/);
  });
});
