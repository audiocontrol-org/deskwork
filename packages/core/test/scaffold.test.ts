import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { scaffoldBlogPost } from '../src/scaffold.ts';
import type { DeskworkConfig } from '../src/config.ts';
import type { CalendarEntry } from '../src/types.ts';

function makeConfig(overrides?: Partial<DeskworkConfig>): DeskworkConfig {
  return {
    version: 1,
    sites: {
      audiocontrol: {
        host: 'audiocontrol.org',
        contentDir: 'src/sites/audiocontrol/pages/blog',
        calendarPath: 'docs/editorial-calendar-audiocontrol.md',
        blogLayout: '../../../layouts/BlogLayout.astro',
      },
    },
    defaultSite: 'audiocontrol',
    author: 'Jane Doe',
    ...overrides,
  };
}

function makeEntry(overrides?: Partial<CalendarEntry>): CalendarEntry {
  return {
    slug: 'my-first-post',
    title: 'My First Post',
    description: 'A short description',
    stage: 'Planned',
    targetKeywords: ['one', 'two'],
    source: 'manual',
    ...overrides,
  };
}

describe('scaffoldBlogPost', () => {
  it('creates the directory and index.md with frontmatter + heading + placeholder', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const result = scaffoldBlogPost(root, makeConfig(), 'audiocontrol', makeEntry());

      expect(result.relativePath).toBe(
        'src/sites/audiocontrol/pages/blog/my-first-post/index.md',
      );
      expect(result.filePath).toBe(join(root, result.relativePath));

      const body = readFileSync(result.filePath, 'utf-8');
      expect(body).toContain('layout: ../../../layouts/BlogLayout.astro');
      expect(body).toContain('title: My First Post');
      expect(body).toContain('description: A short description');
      expect(body).toMatch(/datePublished: \d{4}-\d{2}-\d{2}/);
      expect(body).toContain('author: Jane Doe');
      expect(body).toContain('# My First Post');
      expect(body).toContain('<!-- Write your post here -->');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the default site when no site is passed', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const result = scaffoldBlogPost(root, makeConfig(), undefined, makeEntry());
      expect(result.relativePath).toContain('src/sites/audiocontrol/pages/blog/');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows an explicit author to override config.author', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const result = scaffoldBlogPost(
        root,
        makeConfig(),
        'audiocontrol',
        makeEntry(),
        { authorOverride: 'Override Author' },
      );
      const body = readFileSync(result.filePath, 'utf-8');
      expect(body).toContain('author: Override Author');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws when the blog post already exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const entry = makeEntry();
      const existing = join(
        root,
        'src/sites/audiocontrol/pages/blog',
        entry.slug,
        'index.md',
      );
      mkdirSync(dirname(existing), { recursive: true });
      writeFileSync(existing, '# Existing\n', 'utf-8');

      expect(() =>
        scaffoldBlogPost(root, makeConfig(), 'audiocontrol', entry),
      ).toThrow(/already exists/);
      // confirm existing content wasn't overwritten
      expect(readFileSync(existing, 'utf-8')).toBe('# Existing\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips the layout frontmatter when site has no blogLayout configured', () => {
    const config = makeConfig();
    delete config.sites.audiocontrol.blogLayout;
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const result = scaffoldBlogPost(
        root,
        config,
        'audiocontrol',
        makeEntry(),
      );
      const body = readFileSync(result.filePath, 'utf-8');
      expect(body).not.toMatch(/^layout:/m);
      expect(body).toContain('title: My First Post');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('honors blogFilenameTemplate for flat-file layouts', () => {
    const config = makeConfig();
    config.sites.audiocontrol.blogFilenameTemplate = '{slug}.md';
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const result = scaffoldBlogPost(
        root,
        config,
        'audiocontrol',
        makeEntry(),
      );
      expect(result.relativePath).toBe(
        'src/sites/audiocontrol/pages/blog/my-first-post.md',
      );
      expect(existsSync(result.filePath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('emits state frontmatter when blogInitialState is set', () => {
    const config = makeConfig();
    config.sites.audiocontrol.blogInitialState = 'draft';
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const result = scaffoldBlogPost(
        root,
        config,
        'audiocontrol',
        makeEntry(),
      );
      const body = readFileSync(result.filePath, 'utf-8');
      expect(body).toMatch(/^state: draft$/m);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('inserts an ## Outline section when blogOutlineSection is true', () => {
    const config = makeConfig();
    config.sites.audiocontrol.blogOutlineSection = true;
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      const result = scaffoldBlogPost(
        root,
        config,
        'audiocontrol',
        makeEntry(),
      );
      const body = readFileSync(result.filePath, 'utf-8');
      expect(body).toContain('## Outline');
      expect(body).toContain('Sketch the shape of the post here');
      // Outline section must come BEFORE the body placeholder.
      expect(body.indexOf('## Outline')).toBeLessThan(
        body.indexOf('Write your post here'),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws when neither author arg nor config.author is set', () => {
    const config = makeConfig();
    delete config.author;
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      expect(() =>
        scaffoldBlogPost(root, config, 'audiocontrol', makeEntry()),
      ).toThrow(/author/i);
      // and confirm it works when author is passed explicitly
      const result = scaffoldBlogPost(
        root,
        config,
        'audiocontrol',
        makeEntry(),
        { authorOverride: 'Explicit' },
      );
      expect(existsSync(result.filePath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  describe('layout option', () => {
    it("layout='index' (explicit) writes <slug>/index.md and reports the contentDir-relative path", () => {
      const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-layout-'));
      try {
        const entry = makeEntry({ slug: 'characters/strivers' });
        const result = scaffoldBlogPost(root, makeConfig(), 'audiocontrol', entry, {
          layout: 'index',
        });
        expect(result.relativePath).toBe(
          'src/sites/audiocontrol/pages/blog/characters/strivers/index.md',
        );
        expect(result.contentRelativePath).toBe('characters/strivers/index.md');
        expect(existsSync(result.filePath)).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("layout='readme' writes <slug>/README.md", () => {
      const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-readme-'));
      try {
        const entry = makeEntry({ slug: 'the-outbound/characters/strivers' });
        const result = scaffoldBlogPost(root, makeConfig(), 'audiocontrol', entry, {
          layout: 'readme',
        });
        expect(result.contentRelativePath).toBe(
          'the-outbound/characters/strivers/README.md',
        );
        expect(result.relativePath.endsWith('/README.md')).toBe(true);
        expect(existsSync(result.filePath)).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("layout='flat' writes <slug>.md as a sibling under the parent dir", () => {
      const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-flat-'));
      try {
        const entry = makeEntry({ slug: 'the-outbound/characters/alice' });
        const result = scaffoldBlogPost(root, makeConfig(), 'audiocontrol', entry, {
          layout: 'flat',
        });
        expect(result.contentRelativePath).toBe(
          'the-outbound/characters/alice.md',
        );
        // The file lives at .../characters/alice.md — no own dir
        expect(result.filePath.endsWith('/the-outbound/characters/alice.md')).toBe(true);
        expect(existsSync(result.filePath)).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('without layout, falls back to the site template (legacy behavior)', () => {
      const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-default-'));
      try {
        const result = scaffoldBlogPost(
          root,
          makeConfig(),
          'audiocontrol',
          makeEntry({ slug: 'flat-piece' }),
        );
        expect(result.contentRelativePath).toBe('flat-piece/index.md');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  it('throws for an unknown site', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      expect(() =>
        scaffoldBlogPost(root, makeConfig(), 'unknown', makeEntry()),
      ).toThrow(/unknown site/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
