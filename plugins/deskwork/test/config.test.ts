import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseConfig, readConfig, configPath } from '@/lib/config.ts';

describe('parseConfig', () => {
  it('accepts a minimal single-site config and infers defaultSite', () => {
    const cfg = parseConfig({
      version: 1,
      sites: {
        main: {
          host: 'example.com',
          contentDir: 'content/blog',
          calendarPath: '.deskwork/calendar.md',
        },
      },
    });
    expect(cfg.defaultSite).toBe('main');
    expect(cfg.sites.main.host).toBe('example.com');
  });

  it('accepts a multi-site config with explicit defaultSite', () => {
    const cfg = parseConfig({
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
    });
    expect(cfg.defaultSite).toBe('audiocontrol');
    expect(Object.keys(cfg.sites)).toEqual(['audiocontrol', 'editorialcontrol']);
    expect(cfg.sites.audiocontrol.channelsPath).toBe(
      'docs/editorial-channels-audiocontrol.json',
    );
    expect(cfg.sites.editorialcontrol.channelsPath).toBeUndefined();
  });

  it('rejects unsupported config version', () => {
    expect(() =>
      parseConfig({
        version: 2,
        sites: { main: stubSite() },
      }),
    ).toThrow(/version/i);
  });

  it('rejects missing version', () => {
    expect(() => parseConfig({ sites: { main: stubSite() } })).toThrow(
      /version/i,
    );
  });

  it('rejects missing sites', () => {
    expect(() => parseConfig({ version: 1 })).toThrow(/sites/i);
  });

  it('rejects empty sites map', () => {
    expect(() => parseConfig({ version: 1, sites: {} })).toThrow(
      /at least one site/i,
    );
  });

  it('rejects multi-site config without defaultSite', () => {
    expect(() =>
      parseConfig({
        version: 1,
        sites: { a: stubSite(), b: stubSite() },
      }),
    ).toThrow(/defaultSite/);
  });

  it('rejects defaultSite pointing at an unknown site', () => {
    expect(() =>
      parseConfig({
        version: 1,
        sites: { main: stubSite() },
        defaultSite: 'nope',
      }),
    ).toThrow(/defaultSite "nope"/);
  });

  it('rejects site entry missing a required field', () => {
    expect(() =>
      parseConfig({
        version: 1,
        sites: {
          main: {
            host: 'example.com',
            contentDir: 'content/blog',
            // calendarPath missing
          },
        },
      }),
    ).toThrow(/calendarPath/);
  });

  it('rejects non-object input', () => {
    expect(() => parseConfig('string')).toThrow();
    expect(() => parseConfig(null)).toThrow();
    expect(() => parseConfig(undefined)).toThrow();
    expect(() => parseConfig([])).toThrow();
  });

  it('rejects unknown top-level keys (typo guard)', () => {
    expect(() =>
      parseConfig({
        version: 1,
        sites: { main: stubSite() },
        site: { main: stubSite() }, // typo: should be "sites"
      }),
    ).toThrow(/unknown key/i);
  });

  it('accepts optional top-level author', () => {
    const cfg = parseConfig({
      version: 1,
      sites: { main: stubSite() },
      author: 'Jane Doe',
    });
    expect(cfg.author).toBe('Jane Doe');
  });

  it('rejects author that is empty or not a string', () => {
    expect(() =>
      parseConfig({ version: 1, sites: { main: stubSite() }, author: '' }),
    ).toThrow(/author/);
    expect(() =>
      parseConfig({ version: 1, sites: { main: stubSite() }, author: 42 }),
    ).toThrow(/author/);
  });

  it('accepts optional per-site blogLayout', () => {
    const cfg = parseConfig({
      version: 1,
      sites: {
        main: {
          ...stubSite(),
          blogLayout: '../../layouts/BlogLayout.astro',
        },
      },
    });
    expect(cfg.sites.main.blogLayout).toBe('../../layouts/BlogLayout.astro');
  });

  it('rejects per-site blogLayout that is empty or not a string', () => {
    expect(() =>
      parseConfig({
        version: 1,
        sites: { main: { ...stubSite(), blogLayout: '' } },
      }),
    ).toThrow(/blogLayout/);
  });

  it('accepts blogFilenameTemplate and requires {slug} placeholder', () => {
    const cfg = parseConfig({
      version: 1,
      sites: { main: { ...stubSite(), blogFilenameTemplate: '{slug}.md' } },
    });
    expect(cfg.sites.main.blogFilenameTemplate).toBe('{slug}.md');

    expect(() =>
      parseConfig({
        version: 1,
        sites: { main: { ...stubSite(), blogFilenameTemplate: 'static.md' } },
      }),
    ).toThrow(/\{slug\}/);
  });

  it('accepts blogInitialState and rejects empty string', () => {
    const cfg = parseConfig({
      version: 1,
      sites: { main: { ...stubSite(), blogInitialState: 'draft' } },
    });
    expect(cfg.sites.main.blogInitialState).toBe('draft');

    expect(() =>
      parseConfig({
        version: 1,
        sites: { main: { ...stubSite(), blogInitialState: '' } },
      }),
    ).toThrow(/blogInitialState/);
  });

  it('accepts blogOutlineSection boolean and rejects non-boolean', () => {
    const cfg = parseConfig({
      version: 1,
      sites: { main: { ...stubSite(), blogOutlineSection: true } },
    });
    expect(cfg.sites.main.blogOutlineSection).toBe(true);

    expect(() =>
      parseConfig({
        version: 1,
        sites: { main: { ...stubSite(), blogOutlineSection: 'yes' } },
      }),
    ).toThrow(/blogOutlineSection/);
  });
});

describe('readConfig', () => {
  it('reads and parses a config file from a project root', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-config-'));
    try {
      mkdirSync(join(root, '.deskwork'));
      writeFileSync(
        join(root, '.deskwork/config.json'),
        JSON.stringify({
          version: 1,
          sites: {
            main: {
              host: 'example.com',
              contentDir: 'content/blog',
              calendarPath: '.deskwork/calendar.md',
            },
          },
        }),
        'utf8',
      );

      const cfg = readConfig(root);
      expect(cfg.defaultSite).toBe('main');
      expect(cfg.sites.main.host).toBe('example.com');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws a helpful error when the config file is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-config-'));
    try {
      expect(() => readConfig(root)).toThrow(/\.deskwork\/config\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws a helpful error when the config file is invalid JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-config-'));
    try {
      mkdirSync(join(root, '.deskwork'));
      writeFileSync(join(root, '.deskwork/config.json'), '{ invalid json', 'utf8');
      expect(() => readConfig(root)).toThrow(/JSON/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('configPath', () => {
  it('returns .deskwork/config.json under the project root', () => {
    expect(configPath('/tmp/project')).toBe('/tmp/project/.deskwork/config.json');
  });
});

function stubSite() {
  return {
    host: 'example.com',
    contentDir: 'content/blog',
    calendarPath: '.deskwork/calendar.md',
  };
}
