import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  stringifyFrontmatter,
  updateFrontmatter,
  readFrontmatter,
  writeFrontmatter,
} from '@/lib/frontmatter.ts';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parseFrontmatter', () => {
  it('parses YAML frontmatter with string, number, boolean, array, and object values', () => {
    const md = [
      '---',
      'title: "My Post"',
      'draft: true',
      'views: 42',
      'tags:',
      '  - audio',
      '  - vintage',
      'meta:',
      '  author: Jane',
      '---',
      '',
      '# Body',
      '',
      'content',
    ].join('\n');

    const { data, body } = parseFrontmatter(md);
    expect(data.title).toBe('My Post');
    expect(data.draft).toBe(true);
    expect(data.views).toBe(42);
    expect(data.tags).toEqual(['audio', 'vintage']);
    expect(data.meta).toEqual({ author: 'Jane' });
    expect(body).toBe('\n# Body\n\ncontent');
  });

  it('returns empty data when there is no frontmatter', () => {
    const { data, body } = parseFrontmatter('# Just a heading\n\nbody');
    expect(data).toEqual({});
    expect(body).toBe('# Just a heading\n\nbody');
  });

  it('preserves body characters, including trailing newlines', () => {
    const md = '---\ntitle: A\n---\nbody without leading newline';
    const { body } = parseFrontmatter(md);
    expect(body).toBe('body without leading newline');
  });

  it('throws a descriptive error on invalid YAML', () => {
    const md = '---\ntitle: "unterminated\n---\nbody';
    expect(() => parseFrontmatter(md)).toThrow(/frontmatter/i);
  });
});

describe('stringifyFrontmatter', () => {
  it('renders a frontmatter block followed by the body, separated by a newline', () => {
    const out = stringifyFrontmatter(
      { title: 'My Post', tags: ['a', 'b'] },
      '# Body',
    );
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('title: My Post');
    expect(out).toContain('tags:');
    expect(out).toContain('  - a');
    expect(out).toContain('\n---\n# Body');
  });

  it('renders an empty frontmatter block when data is empty', () => {
    const out = stringifyFrontmatter({}, 'just body');
    expect(out).toBe('---\n{}\n---\njust body');
  });
});

describe('round-trip', () => {
  it('parse + stringify preserves all data types', () => {
    const original = [
      '---',
      'title: Post',
      'draft: false',
      'count: 7',
      'tags:',
      '  - one',
      '  - two',
      '---',
      '',
      'Body here.',
    ].join('\n');

    const { data, body } = parseFrontmatter(original);
    const restrung = stringifyFrontmatter(data, body);
    const { data: d2, body: b2 } = parseFrontmatter(restrung);
    expect(d2).toEqual(data);
    expect(b2).toEqual(body);
  });
});

describe('updateFrontmatter', () => {
  it('merges patched keys into existing frontmatter and preserves body', () => {
    const md = [
      '---',
      'title: Original',
      'draft: true',
      '---',
      '',
      '# Body',
    ].join('\n');

    const out = updateFrontmatter(md, { draft: false, datePublished: '2026-01-15' });
    const { data, body } = parseFrontmatter(out);
    expect(data.title).toBe('Original');
    expect(data.draft).toBe(false);
    expect(data.datePublished).toBe('2026-01-15');
    expect(body).toBe('\n# Body');
  });

  it('adds frontmatter to a file that has none', () => {
    const md = '# Just Body\n\ncontent';
    const out = updateFrontmatter(md, { title: 'New' });
    const { data, body } = parseFrontmatter(out);
    expect(data.title).toBe('New');
    expect(body).toBe(md);
  });
});

describe('readFrontmatter / writeFrontmatter', () => {
  it('round-trips through the filesystem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deskwork-fm-'));
    try {
      const file = join(dir, 'post.md');
      writeFrontmatter(file, { title: 'Hello', draft: false }, '# Hello\n\nbody\n');
      const { data, body } = readFrontmatter(file);
      expect(data.title).toBe('Hello');
      expect(data.draft).toBe(false);
      expect(body).toBe('# Hello\n\nbody\n');
      expect(readFileSync(file, 'utf-8')).toContain('---');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
