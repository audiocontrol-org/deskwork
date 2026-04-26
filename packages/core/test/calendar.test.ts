import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  parseCalendar,
  renderCalendar,
  renderEmptyCalendar,
  readCalendar,
} from '../src/calendar.ts';
import type { EditorialCalendar } from '../src/types.ts';

describe('parseCalendar', () => {
  it('parses an empty calendar', () => {
    const cal = parseCalendar(renderEmptyCalendar());
    expect(cal.entries).toEqual([]);
    expect(cal.distributions).toEqual([]);
  });

  it('parses a minimal Ideas entry', () => {
    const md = [
      '# Editorial Calendar',
      '',
      '## Ideas',
      '',
      '| Slug | Title | Description | Keywords | Source |',
      '|------|-------|-------------|----------|--------|',
      '| my-post | My Post | A post about things | kw1, kw2 | manual |',
      '',
    ].join('\n');

    const cal = parseCalendar(md);
    expect(cal.entries).toHaveLength(1);
    const { id, ...rest } = cal.entries[0];
    // Parser auto-assigns a UUID for legacy rows missing the column.
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(rest).toEqual({
      slug: 'my-post',
      title: 'My Post',
      description: 'A post about things',
      stage: 'Ideas',
      targetKeywords: ['kw1', 'kw2'],
      source: 'manual',
    });
  });

  it('parses Published entries with Topics, Type, URL, Published, Issue columns', () => {
    const md = [
      '# Editorial Calendar',
      '',
      '## Published',
      '',
      '| Slug | Title | Description | Keywords | Topics | Type | URL | Source | Published | Issue |',
      '|------|------|------|------|------|------|------|------|------|------|',
      '| my-video | My Video | A cool video | kw1 | synthdiy | youtube | https://youtu.be/abc | manual | 2026-01-15 | #42 |',
    ].join('\n');

    const cal = parseCalendar(md);
    const { id, ...rest } = cal.entries[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(rest).toEqual({
      slug: 'my-video',
      title: 'My Video',
      description: 'A cool video',
      stage: 'Published',
      targetKeywords: ['kw1'],
      topics: ['synthdiy'],
      contentType: 'youtube',
      contentUrl: 'https://youtu.be/abc',
      source: 'manual',
      datePublished: '2026-01-15',
      issueNumber: 42,
    });
  });

  it('parses distribution records', () => {
    const md = [
      '# Editorial Calendar',
      '',
      '## Distribution',
      '',
      '| Slug | Platform | URL | Shared | Channel | Notes |',
      '|------|------|------|------|------|------|',
      '| my-post | reddit | https://reddit.com/r/foo/abc | 2026-01-20 | r/foo | top comment |',
    ].join('\n');

    const cal = parseCalendar(md);
    expect(cal.distributions).toEqual([
      {
        // No matching entry in this fixture — entryId stays empty.
        entryId: '',
        slug: 'my-post',
        platform: 'reddit',
        url: 'https://reddit.com/r/foo/abc',
        dateShared: '2026-01-20',
        channel: 'r/foo',
        notes: 'top comment',
      },
    ]);
  });

  it('merges shortform blocks onto their matching distribution record', () => {
    const md = [
      '# Editorial Calendar',
      '',
      '## Distribution',
      '',
      '| Slug | Platform | URL | Shared | Channel | Notes |',
      '|------|------|------|------|------|------|',
      '| my-post | reddit | https://reddit.com/r/foo/abc | 2026-01-20 | r/foo |  |',
      '',
      '## Shortform Copy',
      '',
      '### my-post · reddit · r/foo',
      '',
      'title: Check this out',
      '',
      'Body text goes here.',
      '',
    ].join('\n');

    const cal = parseCalendar(md);
    expect(cal.distributions[0].shortform).toBe(
      'title: Check this out\n\nBody text goes here.',
    );
  });

  it('defaults missing contentType to blog via effectiveContentType', () => {
    const md = [
      '# Editorial Calendar',
      '',
      '## Ideas',
      '',
      '| Slug | Title | Description | Keywords | Source |',
      '|------|------|------|------|------|',
      '| legacy | Legacy | No type col | | manual |',
    ].join('\n');

    const cal = parseCalendar(md);
    expect(cal.entries[0].contentType).toBeUndefined();
  });
});

describe('renderCalendar', () => {
  it('renders empty stages with a placeholder', () => {
    const out = renderEmptyCalendar();
    expect(out).toContain('## Ideas\n\n*No entries.*');
    expect(out).toContain('## Published\n\n*No entries.*');
    expect(out).toContain('## Distribution\n\n*No entries.*');
  });

  it('only emits optional columns when any entry uses them', () => {
    const cal: EditorialCalendar = {
      entries: [
        {
          slug: 'plain-post',
          title: 'Plain Post',
          description: 'no extras',
          stage: 'Ideas',
          targetKeywords: [],
          source: 'manual',
        },
      ],
      distributions: [],
    };
    const out = renderCalendar(cal);
    const ideas = out.split('## Ideas')[1].split('## Planned')[0];
    expect(ideas).not.toMatch(/Topics/);
    expect(ideas).not.toMatch(/Type/);
    expect(ideas).not.toMatch(/URL/);
    expect(ideas).toMatch(/\| Slug \| Title \| Description \| Keywords \| Source \|/);
  });

  it('emits Topics column when any entry has topics', () => {
    const cal: EditorialCalendar = {
      entries: [
        {
          slug: 'a',
          title: 'A',
          description: '',
          stage: 'Ideas',
          targetKeywords: [],
          topics: ['synthdiy'],
          source: 'manual',
        },
        {
          slug: 'b',
          title: 'B',
          description: '',
          stage: 'Ideas',
          targetKeywords: [],
          source: 'manual',
        },
      ],
      distributions: [],
    };
    const out = renderCalendar(cal);
    expect(out).toMatch(/\| Slug \| Title \| Description \| Keywords \| Topics \| Source \|/);
  });

  it('escapes pipe characters in cell values', () => {
    const cal: EditorialCalendar = {
      entries: [
        {
          slug: 'pipey',
          title: 'Pipes | in | title',
          description: 'a|b',
          stage: 'Ideas',
          targetKeywords: [],
          source: 'manual',
        },
      ],
      distributions: [],
    };
    const out = renderCalendar(cal);
    expect(out).toContain('Pipes \\| in \\| title');
    expect(out).toContain('a\\|b');
  });
});

describe('round-trip', () => {
  it('round-trips a calendar with all optional columns and distributions', () => {
    // Entries in canonical render order: Ideas, then Planned, ..., then Published.
    // UUIDs pre-assigned so the round-trip is deterministic — the parser
    // would otherwise mint fresh ones for the legacy fixture.
    const p1Id = '11111111-1111-4111-8111-111111111111';
    const p2Id = '22222222-2222-4222-8222-222222222222';
    const cal: EditorialCalendar = {
      entries: [
        {
          id: p2Id,
          slug: 'p2',
          title: 'Idea Two',
          description: 'desc two',
          stage: 'Ideas',
          targetKeywords: [],
          source: 'analytics',
        },
        {
          id: p1Id,
          slug: 'p1',
          title: 'Post One',
          description: 'desc one',
          stage: 'Published',
          targetKeywords: ['k1', 'k2'],
          topics: ['t1', 't2'],
          contentType: 'youtube',
          contentUrl: 'https://youtu.be/xyz',
          source: 'manual',
          datePublished: '2026-03-03',
          issueNumber: 17,
        },
      ],
      distributions: [
        {
          entryId: p1Id,
          slug: 'p1',
          platform: 'reddit',
          url: 'https://reddit.com/r/foo/abc',
          dateShared: '2026-03-04',
          channel: 'r/foo',
          notes: 'top',
          shortform: 'title: Catchy\n\nBody.',
        },
      ],
    };

    const rendered = renderCalendar(cal);
    const parsed = parseCalendar(rendered);
    expect(parsed).toEqual(cal);
  });
});

// --- Round-trip against the live audiocontrol.org calendar. --------------
//
// Skipped automatically when the reference file isn't present (so the
// plugin tests don't fail on a fresh checkout). When available, this is
// the Phase 2 acceptance criterion: parse + re-render must produce a
// semantically identical calendar against the live data.

const LIVE_CALENDAR =
  '/Users/orion/work/audiocontrol.org/docs/editorial-calendar-audiocontrol.md';

describe.runIf(existsSync(LIVE_CALENDAR))(
  'live audiocontrol.org calendar',
  () => {
    it('parses without throwing and finds published entries', () => {
      const cal = readCalendar(LIVE_CALENDAR);
      expect(cal.entries.length).toBeGreaterThan(0);
      expect(cal.entries.filter((e) => e.stage === 'Published').length).toBeGreaterThan(0);
    });

    it('round-trips — re-parsing the rendered output yields identical data', () => {
      const raw = readFileSync(LIVE_CALENDAR, 'utf-8');
      const first = parseCalendar(raw);
      const rendered = renderCalendar(first);
      const second = parseCalendar(rendered);
      expect(second).toEqual(first);
    });
  },
);
