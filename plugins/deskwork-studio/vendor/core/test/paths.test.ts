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
  findEntryFile,
  resolveShortformFilePath,
  resolveSite,
  resolveCalendarPath,
  resolveChannelsPath,
  resolveContentDir,
  resolveSiteHost,
  resolveSiteBaseUrl,
} from '../src/paths.ts';
import type { ContentIndex } from '../src/content-index.ts';
import type { DeskworkConfig } from '../src/config.ts';

const singleSite: DeskworkConfig = {
  version: 1,
  sites: {
    main: {
      host: 'example.com',
      contentDir: 'content/blog',
      calendarPath: '.deskwork/calendar.md',
    },
  },
  defaultSite: 'main',
};

const multiSite: DeskworkConfig = {
  version: 1,
  sites: {
    audiocontrol: {
      host: 'audiocontrol.org',
      contentDir: 'src/sites/audiocontrol/pages/blog',
      calendarPath: 'docs/editorial-calendar-audiocontrol.md',
      channelsPath: 'docs/editorial-channels-audiocontrol.json',
    },
    editorialcontrol: {
      host: 'editorialcontrol.org',
      contentDir: 'src/sites/editorialcontrol/pages/blog',
      calendarPath: 'docs/editorial-calendar-editorialcontrol.md',
    },
  },
  defaultSite: 'audiocontrol',
};

describe('resolveSite', () => {
  it('returns the named site when it exists', () => {
    expect(resolveSite(multiSite, 'editorialcontrol')).toBe('editorialcontrol');
  });

  it('falls back to defaultSite when the argument is undefined', () => {
    expect(resolveSite(multiSite, undefined)).toBe('audiocontrol');
  });

  it('falls back to defaultSite when the argument is null or empty string', () => {
    expect(resolveSite(multiSite, null)).toBe('audiocontrol');
    expect(resolveSite(multiSite, '')).toBe('audiocontrol');
  });

  it('throws with the valid sites listed when the argument is unknown', () => {
    expect(() => resolveSite(multiSite, 'bogus')).toThrow(/bogus/);
    expect(() => resolveSite(multiSite, 'bogus')).toThrow(
      /audiocontrol.*editorialcontrol/,
    );
  });
});

describe('resolveCalendarPath', () => {
  it('joins project root with the site calendar path', () => {
    expect(
      resolveCalendarPath('/tmp/project', multiSite, 'audiocontrol'),
    ).toBe('/tmp/project/docs/editorial-calendar-audiocontrol.md');
  });

  it('defaults to the defaultSite when site is not passed', () => {
    expect(resolveCalendarPath('/tmp/project', singleSite)).toBe(
      '/tmp/project/.deskwork/calendar.md',
    );
  });

  it('throws for an unknown site', () => {
    expect(() =>
      resolveCalendarPath('/tmp/project', multiSite, 'nope'),
    ).toThrow(/nope/);
  });
});

describe('resolveChannelsPath', () => {
  it('returns the resolved channels path when the site declares one', () => {
    expect(
      resolveChannelsPath('/tmp/project', multiSite, 'audiocontrol'),
    ).toBe('/tmp/project/docs/editorial-channels-audiocontrol.json');
  });

  it('returns undefined when the site has no channelsPath', () => {
    expect(
      resolveChannelsPath('/tmp/project', multiSite, 'editorialcontrol'),
    ).toBeUndefined();
  });
});

describe('resolveContentDir', () => {
  it('joins project root with the site content directory', () => {
    expect(resolveContentDir('/tmp/project', multiSite, 'audiocontrol')).toBe(
      '/tmp/project/src/sites/audiocontrol/pages/blog',
    );
  });
});

describe('resolveSiteHost', () => {
  it('returns the configured host for a site', () => {
    expect(resolveSiteHost(multiSite, 'audiocontrol')).toBe('audiocontrol.org');
    expect(resolveSiteHost(multiSite, 'editorialcontrol')).toBe(
      'editorialcontrol.org',
    );
  });

  it('defaults to the defaultSite', () => {
    expect(resolveSiteHost(singleSite)).toBe('example.com');
  });
});

describe('resolveSiteBaseUrl', () => {
  it('builds a canonical https URL with trailing slash', () => {
    expect(resolveSiteBaseUrl(multiSite, 'audiocontrol')).toBe(
      'https://audiocontrol.org/',
    );
  });
});

describe('findEntryFile (Phase 19c)', () => {
  // findEntryFile precedence:
  //   1. Index byId hit → that absolute path.
  //   2. Legacy fallback (when entry passed) → template-driven path.
  //   3. Otherwise → undefined.

  let root: string;
  const cfg: DeskworkConfig = {
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

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-find-entry-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns the indexed path when entry id is in the byId map', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const abs = '/some/abs/path/projects/the-outbound/index.md';
    const idx: ContentIndex = {
      byId: new Map([[id, abs]]),
      byPath: new Map([['the-outbound/index.md', id]]),
      invalid: [],
    };
    expect(findEntryFile(root, cfg, 'wc', id, idx)).toBe(abs);
  });

  it('returns undefined when id is missing AND no fallback entry passed', () => {
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    expect(findEntryFile(root, cfg, 'wc', 'no-such-id', idx)).toBeUndefined();
  });

  it('falls back to slug-template when entry is passed and id is unknown', () => {
    const idx: ContentIndex = {
      byId: new Map(),
      byPath: new Map(),
      invalid: [],
    };
    const result = findEntryFile(root, cfg, 'wc', '', idx, { slug: 'my-post' });
    expect(result).toBe(join(root, 'src/content/projects/my-post/index.md'));
  });

  it('builds the index on demand when none is passed', () => {
    // Lay down a real fixture file with frontmatter id; let
    // findEntryFile build the index.
    const id = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
    const abs = join(root, 'src/content/projects/the-outbound/index.md');
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(
      abs,
      `---\ndeskwork:\n  id: ${id}\ntitle: The Outbound\n---\n\n# The Outbound\n`,
    );
    expect(findEntryFile(root, cfg, 'wc', id)).toBe(abs);
  });
});

describe('resolveShortformFilePath (Phase 21a)', () => {
  let root: string;
  const cfg: DeskworkConfig = {
    version: 1,
    sites: {
      wc: {
        host: 'wc.example',
        contentDir: 'src/content/blog',
        calendarPath: 'docs/cal.md',
      },
    },
    defaultSite: 'wc',
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-shortform-path-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('returns <entry-dir>/scrapbook/shortform/<platform>.md when no channel', () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const entryFile = join(root, 'src/content/blog/my-post/index.md');
    mkdirSync(join(entryFile, '..'), { recursive: true });
    writeFileSync(
      entryFile,
      `---\ndeskwork:\n  id: ${id}\ntitle: My Post\n---\n\n# My Post\n`,
    );

    const out = resolveShortformFilePath(
      root,
      cfg,
      'wc',
      { id, slug: 'my-post' },
      'linkedin',
    );
    expect(out).toBe(
      join(root, 'src/content/blog/my-post/scrapbook/shortform/linkedin.md'),
    );
  });

  it('appends -<channel> when channel is passed', () => {
    const id = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    const entryFile = join(root, 'src/content/blog/my-post/index.md');
    mkdirSync(join(entryFile, '..'), { recursive: true });
    writeFileSync(
      entryFile,
      `---\ndeskwork:\n  id: ${id}\ntitle: My Post\n---\n\n# Body\n`,
    );

    const out = resolveShortformFilePath(
      root,
      cfg,
      'wc',
      { id, slug: 'my-post' },
      'reddit',
      'rprogramming',
    );
    expect(out).toBe(
      join(
        root,
        'src/content/blog/my-post/scrapbook/shortform/reddit-rprogramming.md',
      ),
    );
  });

  it('uses slug-template fallback when no id binding (legacy / pre-doctor)', () => {
    // No file laid down; the slug-template fallback path under findEntryFile
    // assumes the entry's body would land at <slug>/index.md. resolveShortformFilePath
    // returns the derived shortform path even though the body doesn't yet exist.
    const out = resolveShortformFilePath(
      root,
      cfg,
      'wc',
      { slug: 'planned-but-no-scaffold' },
      'youtube',
    );
    expect(out).toBe(
      join(
        root,
        'src/content/blog/planned-but-no-scaffold/scrapbook/shortform/youtube.md',
      ),
    );
  });

  it('throws on a channel with invalid characters', () => {
    expect(() =>
      resolveShortformFilePath(
        root,
        cfg,
        'wc',
        { slug: 'my-post' },
        'reddit',
        'rProgramming',
      ),
    ).toThrow(/Invalid shortform channel/);
    expect(() =>
      resolveShortformFilePath(
        root,
        cfg,
        'wc',
        { slug: 'my-post' },
        'reddit',
        'r/programming',
      ),
    ).toThrow(/Invalid shortform channel/);
  });

  it('treats empty channel as undefined and resolves to bare platform.md', () => {
    const out = resolveShortformFilePath(
      root,
      cfg,
      'wc',
      { slug: 'p' },
      'instagram',
      '',
    );
    expect(out).toBe(
      join(root, 'src/content/blog/p/scrapbook/shortform/instagram.md'),
    );
  });
});
