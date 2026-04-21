import { describe, it, expect } from 'vitest';
import {
  resolveSite,
  resolveCalendarPath,
  resolveChannelsPath,
  resolveContentDir,
  resolveSiteHost,
  resolveSiteBaseUrl,
} from '@/lib/paths.ts';
import type { DeskworkConfig } from '@/lib/config.ts';

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
