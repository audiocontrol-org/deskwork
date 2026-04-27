import { describe, it, expect } from 'vitest';
import {
  addEntry,
  planEntry,
  outlineEntry,
  draftEntry,
  publishEntry,
  pauseEntry,
  unpauseEntry,
  findEntry,
  addDistribution,
  slugify,
} from '../src/calendar-mutations.ts';
import { parseCalendar, renderCalendar } from '../src/calendar.ts';
import { PAUSABLE_STAGES, type EditorialCalendar } from '../src/types.ts';

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

describe('outlineEntry', () => {
  it('moves Planned to Outlining', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Outliner');
    planEntry(cal, 'outliner', ['kw']);
    const out = outlineEntry(cal, 'outliner');
    expect(out.stage).toBe('Outlining');
  });

  it('throws for unknown slug', () => {
    expect(() => outlineEntry(emptyCalendar(), 'missing')).toThrow(
      /No calendar entry found/,
    );
  });

  it('throws when entry is not in Planned', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Still Ideas');
    expect(() => outlineEntry(cal, 'still-ideas')).toThrow(/must be in Planned/);
  });
});

describe('draftEntry', () => {
  it('moves Outlining to Drafting and records issue number', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'A');
    planEntry(cal, 'a', []);
    outlineEntry(cal, 'a');
    const drafted = draftEntry(cal, 'a', 99);
    expect(drafted.stage).toBe('Drafting');
    expect(drafted.issueNumber).toBe(99);
  });

  it('leaves issueNumber unset when not provided', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'B');
    planEntry(cal, 'b', []);
    outlineEntry(cal, 'b');
    const drafted = draftEntry(cal, 'b');
    expect(drafted.issueNumber).toBeUndefined();
  });

  it('throws when entry is not in Outlining', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'C');
    planEntry(cal, 'c', []);
    expect(() => draftEntry(cal, 'c')).toThrow(/must be in Outlining/);
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

  it('accepts an explicit datePublished and works from any non-Published stage', () => {
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

describe('pauseEntry / unpauseEntry (#27)', () => {
  it('pauses from each non-terminal stage and resumes back to it', () => {
    for (const targetStage of PAUSABLE_STAGES) {
      const cal = emptyCalendar();
      addEntry(cal, `Pause Me from ${targetStage}`);
      const e = findEntry(cal, slugify(`Pause Me from ${targetStage}`))!;
      e.stage = targetStage;

      const paused = pauseEntry(cal, e.slug);
      expect(paused.stage).toBe('Paused');
      expect(paused.pausedFrom).toBe(targetStage);

      const resumed = unpauseEntry(cal, e.slug);
      expect(resumed.stage).toBe(targetStage);
      expect(resumed.pausedFrom).toBeUndefined();
    }
  });

  it('refuses to pause an already-Paused entry', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Already Paused');
    pauseEntry(cal, 'already-paused');
    expect(() => pauseEntry(cal, 'already-paused')).toThrow(/already Paused/);
  });

  it('refuses to pause a Published entry', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Shipped');
    publishEntry(cal, 'shipped');
    expect(() => pauseEntry(cal, 'shipped')).toThrow(/non-terminal stages/);
  });

  it('refuses to resume a non-Paused entry', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Idle');
    expect(() => unpauseEntry(cal, 'idle')).toThrow(/only Paused/);
  });

  it('throws on unknown slug for both pause and resume', () => {
    expect(() => pauseEntry(emptyCalendar(), 'missing')).toThrow(/No calendar entry/);
    expect(() => unpauseEntry(emptyCalendar(), 'missing')).toThrow(/No calendar entry/);
  });

  it('refuses to resume when pausedFrom is missing (corrupt state)', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Hand Edit');
    const e = findEntry(cal, 'hand-edit')!;
    e.stage = 'Paused';
    // pausedFrom intentionally absent — simulates a manually-edited
    // calendar where the operator typed `Paused` without going
    // through the mutation.
    expect(() => unpauseEntry(cal, 'hand-edit')).toThrow(
      /no pausedFrom/,
    );
  });

  it('round-trips Paused + pausedFrom through parseCalendar / renderCalendar', () => {
    const cal = emptyCalendar();
    addEntry(cal, 'Drift Mid-Outline');
    planEntry(cal, 'drift-mid-outline', ['x']);
    outlineEntry(cal, 'drift-mid-outline');
    pauseEntry(cal, 'drift-mid-outline');
    const md = renderCalendar(cal);
    expect(md).toContain('## Paused');
    expect(md).toMatch(/PausedFrom/);
    expect(md).toMatch(/Outlining/);

    const parsed = parseCalendar(md);
    const restored = parsed.entries.find((e) => e.slug === 'drift-mid-outline');
    expect(restored?.stage).toBe('Paused');
    expect(restored?.pausedFrom).toBe('Outlining');
  });

  it('parses legacy calendars (no Paused section) without breaking', () => {
    const md = [
      '# Editorial Calendar',
      '',
      '## Ideas',
      '',
      '*No entries.*',
      '',
      '## Planned',
      '',
      '*No entries.*',
      '',
      '## Outlining',
      '',
      '*No entries.*',
      '',
      '## Drafting',
      '',
      '*No entries.*',
      '',
      '## Review',
      '',
      '*No entries.*',
      '',
      '## Published',
      '',
      '*No entries.*',
      '',
    ].join('\n');
    const cal = parseCalendar(md);
    expect(cal.entries).toEqual([]);
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
