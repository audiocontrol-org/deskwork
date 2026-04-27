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

function runFromCwd(
  cwd: string,
  args: string[],
): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['install', ...args], {
    encoding: 'utf-8',
    cwd,
  });
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

  it('exits 2 with a usage message when too many args are passed', () => {
    // 3+ positional args is an unambiguous usage error. (0 and 1 args
    // are valid one-arg form post-dispatcher; 2 args is the explicit
    // two-arg form.)
    const res = run(['/tmp/a', '/tmp/b', '/tmp/c']);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage/);
  });

  it('one-arg form: project-root defaults to cwd when only config is passed', () => {
    // Simulates the natural agent invocation `deskwork install /tmp/cfg.json`
    // from inside the host project's directory. The dispatcher's pathLike
    // heuristic does NOT inject cwd because the absolute config path looks
    // path-like — it's the install command itself that infers project-root
    // from cwd in that case.
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {
          a: {
            host: 'a.example',
            contentDir: 'src/content',
            calendarPath: 'docs/cal.md',
          },
        },
        defaultSite: 'a',
      });
      const res = runFromCwd(project, [cfgFile]);
      expect(res.code).toBe(0);
      // Heads-up message confirms inferred root before any writes
      expect(res.stdout).toMatch(/Installing into:/);
      // Real project file landed at the cwd-inferred root
      expect(existsSync(join(project, '.deskwork/config.json'))).toBe(true);
      expect(existsSync(join(project, 'docs/cal.md'))).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('one-arg form: bare config name (non-path-like) routes through dispatcher cwd-injection', () => {
    // `deskwork install bare-config.json` — first arg isn't path-like, so
    // the dispatcher injects cwd ahead of it; install then sees the
    // 2-arg form. End result is identical to the one-arg path-like case
    // above, just via a different code path.
    project = newProject();
    try {
      writeFileSync(
        join(project, 'bare-config.json'),
        JSON.stringify({
          version: 1,
          sites: {
            x: {
              host: 'x.example',
              contentDir: 'src',
              calendarPath: 'cal.md',
            },
          },
          defaultSite: 'x',
        }),
        'utf-8',
      );
      const res = runFromCwd(project, ['bare-config.json']);
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/Installing into:/);
      expect(existsSync(join(project, '.deskwork/config.json'))).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it('schema pre-flight: prints patch instructions on Astro projects with strict schema (Issue #42)', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      // Bare-bones Astro fixture: astro config at root + a strict
      // content schema with no deskwork field and no passthrough.
      writeFileSync(
        join(project, 'astro.config.mjs'),
        'export default {};\n',
        'utf-8',
      );
      mkdirSync(join(project, 'src/content'), { recursive: true });
      writeFileSync(
        join(project, 'src/content/config.ts'),
        [
          "import { defineCollection, z } from 'astro:content';",
          '',
          'const blog = defineCollection({',
          "  type: 'content',",
          '  schema: z.object({',
          '    title: z.string(),',
          '  }),',
          '});',
          '',
          'export const collections = { blog };',
          '',
        ].join('\n'),
        'utf-8',
      );
      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {
          main: {
            host: 'example.com',
            contentDir: 'src/content/blog',
            calendarPath: '.deskwork/calendar.md',
          },
        },
      });
      const res = run([project, cfgFile]);
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/Schema pre-flight: UNCERTAIN/);
      // The patch instructions text is printed inline.
      expect(res.stdout).toMatch(/deskwork:\s*z\.object/);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('schema pre-flight: reports OK when schema declares a `deskwork` field (Issue #42)', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      writeFileSync(
        join(project, 'astro.config.mjs'),
        'export default {};\n',
        'utf-8',
      );
      mkdirSync(join(project, 'src/content'), { recursive: true });
      writeFileSync(
        join(project, 'src/content/config.ts'),
        [
          "import { defineCollection, z } from 'astro:content';",
          '',
          'const blog = defineCollection({',
          '  schema: z.object({',
          '    deskwork: z.object({ id: z.string().uuid() }).passthrough().optional(),',
          '    title: z.string(),',
          '  }),',
          '});',
          '',
        ].join('\n'),
        'utf-8',
      );
      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {
          main: {
            host: 'example.com',
            contentDir: 'src/content/blog',
            calendarPath: '.deskwork/calendar.md',
          },
        },
      });
      const res = run([project, cfgFile]);
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/Schema pre-flight: OK/);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('schema pre-flight: skipped on non-Astro projects (Issue #42)', () => {
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
      expect(res.stdout).toMatch(/Schema pre-flight: skipped/);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('existing-pipeline detection: warns about competing in-house implementations (Issue #45)', () => {
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      // Plant signals matching the audiocontrol layout described in #45.
      mkdirSync(join(project, 'journal/editorial/history'), { recursive: true });
      mkdirSync(join(project, '.claude/skills/editorial-add'), {
        recursive: true,
      });
      mkdirSync(join(project, '.claude/skills/editorial-plan'), {
        recursive: true,
      });
      mkdirSync(join(project, '.claude/skills/editorial-outline'), {
        recursive: true,
      });
      mkdirSync(join(project, 'scripts/lib/editorial-review'), {
        recursive: true,
      });

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
      expect(res.stdout).toMatch(
        /Detected existing editorial-pipeline signals/,
      );
      expect(res.stdout).toMatch(/journal\/editorial/);
      expect(res.stdout).toMatch(/editorial-add/);
      expect(res.stdout).toMatch(/install ALONGSIDE/);
      expect(res.stdout).toMatch(/Resolve overlap manually/);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('existing-pipeline detection: silent on bare projects (Issue #45)', () => {
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
      // No warning should appear.
      expect(res.stdout).not.toMatch(/Detected existing editorial-pipeline/);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });

  it('two-arg form: explicit project-root still works', () => {
    // Backward-compat: `deskwork install <project-root> <config-file>`
    // continues to behave as it did before the one-arg shape was added.
    project = newProject();
    tmpConfigs = newTmpConfigDir();
    try {
      const cfgFile = writeConfigFile(tmpConfigs, {
        version: 1,
        sites: {
          y: {
            host: 'y.example',
            contentDir: 'src/content',
            calendarPath: 'docs/cal-y.md',
          },
        },
        defaultSite: 'y',
      });
      const res = run([project, cfgFile]);
      expect(res.code).toBe(0);
      expect(res.stdout).toMatch(/Installing into:/);
      expect(existsSync(join(project, '.deskwork/config.json'))).toBe(true);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(tmpConfigs, { recursive: true, force: true });
    }
  });
});
