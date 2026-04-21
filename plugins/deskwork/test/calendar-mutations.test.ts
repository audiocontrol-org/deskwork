import { describe, it, expect } from 'vitest';
import {
  addEntry,
  planEntry,
  draftEntry,
  publishEntry,
  findEntry,
  addDistribution,
  slugify,
} from '@/lib/calendar-mutations.ts';
import type { EditorialCalendar } from '@/lib/types.ts';

function emptyCalendar(): EditorialCalendar {
  return { entries: [], distributions: [] };
}

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('   leading  spaces  ')).toBe('leading-spaces');
    expect(slugify('Multi---Hyphen')).toBe('multi-hyphen');
  });
});

describe('addEntry', () => {
  it('creates an Ideas entry with slug derived from title', () => {
    const cal = emptyCalendar();
    const entry = addEntry(cal, 'My First Post', { description: 'a post' });
    expect(entry.slug).toBe('my-first-post');
    expect(entry.stage).toBe('Ideas');
    expect(entry.description).toBe('a post');
    expect(entry.source).toBe('manual');
    expect(cal.entries).toHaveLength(1);
  });

  it('defaults source to manual and description to empty string', () => {
    const cal = emptyCalendar();
    const entry = addEntry(cal, 'Bare Title');
    expect(entry.source).toBe('manual');
    expect(entry.description).toBe('');
  });

  it('accepts analytics source', () => {
    const cal = emptyCalendar();
    const entry = addEntry(cal, 'Analytics Idea', { source: 'analytics' });
    expect(entry.source).toBe('analytics');
  });

  it('throws when slug already exists', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Same Title');
    expect(() => addEntry(cal, 'Same Title')).toThrow(/already exists/);
  });
});

describe('planEntry', () => {
  it('moves an Ideas entry to Planned and sets keywords', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Topic');
    const planned = planEntry(cal, 'topic', ['seo', 'keywords']);
    expect(planned.stage).toBe('Planned');
    expect(planned.targetKeywords).toEqual(['seo', 'keywords']);
  });

  it('throws for unknown slug', () => {
    expect(() => planEntry(emptyCalendar(), 'missing', [])).toThrow(
      /No calendar entry found/,
    );
  });

  it('throws when entry is not in Ideas stage', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Already Published');
    const entry = findEntry(cal, 'already-published');
    entry!.stage = 'Published';
    expect(() => planEntry(cal, 'already-published', [])).toThrow(
      /must be in Ideas/,
    );
  });
});

describe('draftEntry', () => {
  it('moves Planned to Drafting and records issue number', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'A');
    planEntry(cal, 'a', []);
    const drafted = draftEntry(cal, 'a', 99);
    expect(drafted.stage).toBe('Drafting');
    expect(drafted.issueNumber).toBe(99);
  });

  it('leaves issueNumber unset when not provided', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'B');
    planEntry(cal, 'b', []);
    const drafted = draftEntry(cal, 'b');
    expect(drafted.issueNumber).toBeUndefined();
  });

  it('throws when entry is not in Planned', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'C');
    expect(() => draftEntry(cal, 'c')).toThrow(/must be in Planned/);
  });
});

describe('publishEntry', () => {
  it('sets stage to Published and datePublished to today when omitted', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'D');
    const published = publishEntry(cal, 'd');
    expect(published.stage).toBe('Published');
    expect(published.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts an explicit datePublished', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'E');
    const published = publishEntry(cal, 'e', '2026-01-01');
    expect(published.datePublished).toBe('2026-01-01');
  });

  it('throws for unknown slug', () => {
    expect(() => publishEntry(emptyCalendar(), 'missing')).toThrow(
      /No calendar entry found/,
    );
  });
});

describe('addDistribution', () => {
  it('appends a distribution record for a Published entry', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'F');
    publishEntry(cal, 'f');
    const rec = addDistribution(cal, {
      slug: 'f',
      platform: 'reddit',
      url: 'https://r.example/xyz',
      dateShared: '2026-02-01',
    });
    expect(cal.distributions).toHaveLength(1);
    expect(rec.platform).toBe('reddit');
  });

  it('throws when the entry is not Published', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'G');
    expect(() =>
      addDistribution(cal, {
        slug: 'g',
        platform: 'reddit',
        url: 'https://r.example/abc',
        dateShared: '2026-02-01',
      }),
    ).toThrow(/must be Published/);
  });

  it('throws when the entry does not exist', () => {
    const cal = emptyCalendar();
    expect(() =>
      addDistribution(cal, {
        slug: 'missing',
        platform: 'reddit',
        url: 'https://x',
        dateShared: '2026-01-01',
      }),
    ).toThrow(/No calendar entry found/);
  });
});
