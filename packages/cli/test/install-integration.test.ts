/**
 * Integration test for the install subcommand. Exercises the deskwork
 * dispatcher against real fixture directories, not mocked filesystem.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['install', ...args], { encoding: 'utf-8' });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function writeConfigFile(dir: string, value: unknown): string {
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify(value), 'utf-8');
  return path;
}

describe('deskwork-install', () => {
  let project: string;
  let tmpConfigs: string;

  beforeAll(() => {
    // Sanity check the dispatcher exists before every test runs it.
    expect(existsSync(deskworkBin)).toBe(true);
  });

  function newProject(): string {
    return mkdtempSync(join(tmpdir(), 'deskwork-install-proj-'));
  }

  function newTmpConfigDir(): string {
    return mkdtempSync(join(tmpdir(), 'deskwork-install-cfg-'));
  }

  it('writes the config and creates an empty calendar for a single-site project', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {
          main: {
            host: 'example.com',
            contentDir: 'content/blog',
            calendarPath: '.deskwork/calendar.md',
          },
        },
      });

      const res = run([project, cfgFile]);
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/Wrote config/);
      expect(res.stdout).toMatch(/Default site: main/);
      expect(res.stdout).toMatch(/Created calendars/);

      const writtenConfig = JSON.parse(
        readFileSync(join(project, '.deskwork/config.json'), 'utf-8'),
      );
      expect(writtenConfig.defaultSite).toBe('main');

      const calendar = readFileSync(
        join(project, '.deskwork/calendar.md'),
        'utf-8',
      );
      expect(calendar).toContain('# Editorial Calendar');
      expect(calendar).toContain('## Ideas');
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('handles a multi-site config with explicit defaultSite', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {
          audiocontrol: {
            host: 'audiocontrol.org',
            contentDir: 'src/sites/audiocontrol/pages/blog',
            calendarPath: 'docs/editorial-calendar-audiocontrol.md',
          },
          editorialcontrol: {
            host: 'editorialcontrol.org',
            contentDir: 'src/sites/editorialcontrol/pages/blog',
            calendarPath: 'docs/editorial-calendar-editorialcontrol.md',
          },
        },
        defaultSite: 'audiocontrol',
      });

      const res = run([project, cfgFile]);
      expect(res.code).toBe(0);
      expect(
        existsSync(
          join(project, 'docs/editorial-calendar-audiocontrol.md'),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(project, 'docs/editorial-calendar-editorialcontrol.md'),
        ),
      ).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing calendar file', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      const calendarDir = join(project, '.deskwork');
      mkdirSync(calendarDir);
      writeFileSync(join(calendarDir, 'calendar.md'), '# EXISTING\n', 'utf-8');

      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {
          main: {
            host: 'example.com',
            contentDir: 'content/blog',
            calendarPath: '.deskwork/calendar.md',
          },
        },
      });

      const res = run([project, cfgFile]);
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/Left existing calendars untouched/);
      expect(
        readFileSync(join(project, '.deskwork/calendar.md'), 'utf-8'),
      ).toBe('# EXISTING\n');
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('exits non-zero with a schema error when the config is invalid', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {},
      });

      const res = run([project, cfgFile]);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/at least one site/i);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('exits non-zero when the config file is missing', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      const res = run([project, join(tmpConfigs, 'missing.json')]);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toMatch(/does not exist/i);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('exits 2 on missing arguments', () => {
    const res = run([]);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage/);
  });
});
