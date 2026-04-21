import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { scaffoldBlogPost } from '@/lib/scaffold.ts';
import type { DeskworkConfig } from '@/lib/config.ts';
import type { CalendarEntry } from '@/lib/types.ts';

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
        'Override Author',
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

  it('throws when site has no blogLayout configured', () => {
    const config = makeConfig();
    delete config.sites.audiocontrol.blogLayout;
    const root = mkdtempSync(join(tmpdir(), 'deskwork-scaffold-'));
    try {
      expect(() =>
        scaffoldBlogPost(root, config, 'audiocontrol', makeEntry()),
      ).toThrow(/blogLayout/);
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
        'Explicit',
      );
      expect(existsSync(result.filePath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
