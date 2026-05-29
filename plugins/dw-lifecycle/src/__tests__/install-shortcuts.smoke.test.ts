import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installShortcuts,
  parseInstallShortcutsArgs,
  runInstallShortcuts,
} from '../subcommands/install-shortcuts.js';
import { COMMANDS, getScheme, type SchemeId } from '../shortcuts/schemes.js';
import { manifestPath } from '../shortcuts/manifest.js';

function commandsDir(home: string): string {
  return join(home, '.claude', 'commands');
}

function readManifest(home: string): unknown {
  return JSON.parse(readFileSync(manifestPath(home), 'utf8'));
}

describe('install-shortcuts (smoke)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-shortcuts-install-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('default install (scheme C)', () => {
    it('writes all 17 shim files with the canonical body', () => {
      const result = runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      expect(result.shimsWritten.length).toBe(19);

      for (const [cmd, shim] of getScheme('C').entries()) {
        const path = join(commandsDir(tmp), `${shim}.md`);
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, 'utf8')).toBe(`/dw-lifecycle:${cmd} $ARGUMENTS\n`);
      }
    });

    it('writes the manifest with the right schema', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      const manifest = readManifest(tmp);
      expect(manifest).toMatchObject({
        version: 1,
        scheme: 'C',
        rename: null,
        pluginVersion: '0.0.0',
      });
      const m = manifest as { shims: ReadonlyArray<{ command: string; shimName: string }> };
      expect(m.shims.length).toBe(19);

      for (const entry of m.shims) {
        expect(COMMANDS).toContain(entry.command);
        expect(entry.shimName).toBe(`dw-${entry.command}`);
        // Entry contract: exactly two fields (no absolute path field).
        expect(Object.keys(entry).sort()).toEqual(['command', 'shimName']);
      }
    });
  });

  describe('scheme A and B install', () => {
    it('scheme A writes dwi.md, dws.md, dwsh.md', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'A',
        pluginVersion: '0.0.0',
      });
      expect(existsSync(join(commandsDir(tmp), 'dwi.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'dws.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'dwsh.md'))).toBe(true);
      expect(readFileSync(join(commandsDir(tmp), 'dwi.md'), 'utf8')).toBe(
        '/dw-lifecycle:implement $ARGUMENTS\n',
      );
    });

    it('scheme B writes dw-im.md, dw-se.md, dw-sh.md', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'B',
        pluginVersion: '0.0.0',
      });
      expect(existsSync(join(commandsDir(tmp), 'dw-im.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'dw-se.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'dw-sh.md'))).toBe(true);
      expect(readFileSync(join(commandsDir(tmp), 'dw-im.md'), 'utf8')).toBe(
        '/dw-lifecycle:implement $ARGUMENTS\n',
      );
    });
  });

  describe('dry-run', () => {
    it('touches no files but reports intended writes', () => {
      const result = runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.shimsWritten.length).toBe(19);
      expect(existsSync(commandsDir(tmp))).toBe(false);
      expect(existsSync(manifestPath(tmp))).toBe(false);
    });
  });

  describe('foreign shim collision', () => {
    it('without --force, refuses and leaves files unchanged', () => {
      mkdirSync(commandsDir(tmp), { recursive: true });
      const foreignPath = join(commandsDir(tmp), 'dw-implement.md');
      writeFileSync(foreignPath, 'pre-existing content', 'utf8');

      expect(() =>
        runInstallShortcuts({
          home: tmp,
          scheme: 'C',
          pluginVersion: '0.0.0',
        }),
      ).toThrow(/collision/i);

      expect(readFileSync(foreignPath, 'utf8')).toBe('pre-existing content');
      expect(existsSync(manifestPath(tmp))).toBe(false);
    });

    it('with --force, overwrites and records the collision', () => {
      mkdirSync(commandsDir(tmp), { recursive: true });
      const foreignPath = join(commandsDir(tmp), 'dw-implement.md');
      writeFileSync(foreignPath, 'pre-existing content', 'utf8');

      const result = runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
        force: true,
      });

      expect(readFileSync(foreignPath, 'utf8')).toBe('/dw-lifecycle:implement $ARGUMENTS\n');
      expect(result.collisions).toContain(foreignPath);
    });
  });

  describe('prior manifest', () => {
    it('without --replace, refuses', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      expect(() =>
        runInstallShortcuts({
          home: tmp,
          scheme: 'B',
          pluginVersion: '0.0.0',
        }),
      ).toThrow(/prior manifest|--replace/i);
    });

    it('with --replace, cleans up the prior install before installing the new scheme', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });
      expect(existsSync(join(commandsDir(tmp), 'dw-implement.md'))).toBe(true);

      runInstallShortcuts({
        home: tmp,
        scheme: 'B',
        pluginVersion: '0.0.0',
        replace: true,
      });

      // Scheme C's shims should be gone, scheme B's should be present.
      expect(existsSync(join(commandsDir(tmp), 'dw-implement.md'))).toBe(false);
      expect(existsSync(join(commandsDir(tmp), 'dw-im.md'))).toBe(true);

      const manifest = readManifest(tmp) as { scheme: SchemeId };
      expect(manifest.scheme).toBe('B');
    });
  });

  describe('--rename', () => {
    it('scheme C rename "mt" produces mt-<command>.md', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
        rename: 'mt',
      });
      expect(existsSync(join(commandsDir(tmp), 'mt-implement.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'mt-session-start.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'dw-implement.md'))).toBe(false);

      const manifest = readManifest(tmp) as { rename: string | null };
      expect(manifest.rename).toBe('mt');
    });

    it('scheme A rename "mt" produces mti.md, mts.md', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'A',
        pluginVersion: '0.0.0',
        rename: 'mt',
      });
      expect(existsSync(join(commandsDir(tmp), 'mti.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'mts.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'dwi.md'))).toBe(false);
    });

    it('scheme B rename "mt" produces mt-im.md', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'B',
        pluginVersion: '0.0.0',
        rename: 'mt',
      });
      expect(existsSync(join(commandsDir(tmp), 'mt-im.md'))).toBe(true);
      expect(existsSync(join(commandsDir(tmp), 'dw-im.md'))).toBe(false);
    });

    it('rejects uppercase rename prefix', () => {
      expect(() =>
        runInstallShortcuts({
          home: tmp,
          scheme: 'C',
          pluginVersion: '0.0.0',
          rename: 'BAD',
        }),
      ).toThrow(/rename/i);
      expect(existsSync(commandsDir(tmp))).toBe(false);
    });

    it('rejects rename prefix with path separator', () => {
      expect(() =>
        runInstallShortcuts({
          home: tmp,
          scheme: 'C',
          pluginVersion: '0.0.0',
          rename: 'bad/path',
        }),
      ).toThrow(/rename/i);
    });

    it('rejects empty rename prefix', () => {
      expect(() =>
        runInstallShortcuts({
          home: tmp,
          scheme: 'C',
          pluginVersion: '0.0.0',
          rename: '',
        }),
      ).toThrow(/rename/i);
    });

    // Pathological inputs accepted by the looser `[a-z0-9-]+` pattern
    // but rejected by the tighter start/end-alphanumeric rule.
    it.each([['-'], ['--'], ['-mt'], ['mt-'], ['---']])(
      'rejects pathological rename %s',
      (bad) => {
        expect(() =>
          runInstallShortcuts({
            home: tmp,
            scheme: 'C',
            pluginVersion: '0.0.0',
            rename: bad,
          }),
        ).toThrow(/rename/i);
      },
    );

    it.each([['m'], ['mt'], ['mt1'], ['my-shortcut'], ['a-b-c'], ['ab12']])(
      'accepts legitimate rename %s',
      (good) => {
        expect(() =>
          runInstallShortcuts({
            home: tmp,
            scheme: 'C',
            pluginVersion: '0.0.0',
            rename: good,
          }),
        ).not.toThrow();
        // Cleanup between iterations: re-mkdir for next.
        rmSync(commandsDir(tmp), { recursive: true, force: true });
      },
    );
  });

  describe('CLI arg parsing', () => {
    it('parses --scheme=A as scheme A', () => {
      const parsed = parseInstallShortcutsArgs(['--scheme=A']);
      expect(parsed.scheme).toBe('A');
    });

    it('parses --scheme A (space-separated) as scheme A', () => {
      const parsed = parseInstallShortcutsArgs(['--scheme', 'A']);
      expect(parsed.scheme).toBe('A');
    });

    it('rejects --scheme=Z', () => {
      expect(() => parseInstallShortcutsArgs(['--scheme=Z'])).toThrow(/scheme/i);
    });

    it('rejects missing --scheme', () => {
      expect(() => parseInstallShortcutsArgs([])).toThrow(/scheme/i);
    });

    it('parses --force and --dry-run', () => {
      const parsed = parseInstallShortcutsArgs(['--scheme=C', '--force', '--dry-run']);
      expect(parsed.scheme).toBe('C');
      expect(parsed.force).toBe(true);
      expect(parsed.dryRun).toBe(true);
    });

    it('parses --rename <prefix>', () => {
      const parsed = parseInstallShortcutsArgs(['--scheme=C', '--rename', 'mt']);
      expect(parsed.rename).toBe('mt');
    });

    it('parses --replace', () => {
      const parsed = parseInstallShortcutsArgs(['--scheme=C', '--replace']);
      expect(parsed.replace).toBe(true);
    });

    it('rejects unknown flags', () => {
      expect(() => parseInstallShortcutsArgs(['--scheme=C', '--banana'])).toThrow(
        /unknown flag/i,
      );
    });

    it('--help sets help', () => {
      const parsed = parseInstallShortcutsArgs(['--help']);
      expect(parsed.help).toBe(true);
    });
  });

  describe('installShortcuts dispatch shell', () => {
    it('prints usage and exits 0 on --help', async () => {
      const originalLog = console.log;
      const originalExit = process.exit;
      try {
        const stdout: string[] = [];
        const exitCalls: number[] = [];

        console.log = (message?: unknown) => {
          stdout.push(String(message ?? ''));
        };
        process.exit = ((code?: string | number | null) => {
          exitCalls.push(Number(code ?? 0));
          throw new Error(`exit:${code ?? 0}`);
        }) as typeof process.exit;

        await expect(installShortcuts(['--help'])).rejects.toThrow(/exit:0/);
        expect(exitCalls).toEqual([0]);
        expect(stdout.join('\n')).toMatch(/Usage: dw-lifecycle install-shortcuts/);
      } finally {
        console.log = originalLog;
        process.exit = originalExit;
      }
    });

    it('exits with code 2 on a foreign-file collision (no --force)', async () => {
      // Plant a foreign file in the user's $HOME so the install refuses.
      // We override $HOME for the duration of this call so the dispatch
      // shell resolves to our tmp dir.
      const originalHome = process.env.HOME;
      const originalError = console.error;
      const originalExit = process.exit;
      try {
        process.env.HOME = tmp;
        mkdirSync(commandsDir(tmp), { recursive: true });
        const foreignPath = join(commandsDir(tmp), 'dw-implement.md');
        writeFileSync(foreignPath, 'pre-existing content', 'utf8');

        const stderr: string[] = [];
        const exitCalls: number[] = [];

        console.error = (message?: unknown) => {
          stderr.push(String(message ?? ''));
        };
        process.exit = ((code?: string | number | null) => {
          exitCalls.push(Number(code ?? 0));
          throw new Error(`exit:${code ?? 0}`);
        }) as typeof process.exit;

        await expect(installShortcuts(['--scheme=C'])).rejects.toThrow(/exit:2/);
        expect(exitCalls).toEqual([2]);
        expect(stderr.join('\n')).toMatch(/collision/i);
        // Foreign file must remain untouched.
        expect(readFileSync(foreignPath, 'utf8')).toBe('pre-existing content');
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        console.error = originalError;
        process.exit = originalExit;
      }
    });

    it('exits with code 2 on a prior-manifest refusal (no --replace)', async () => {
      const originalHome = process.env.HOME;
      const originalError = console.error;
      const originalLog = console.log;
      const originalExit = process.exit;
      try {
        process.env.HOME = tmp;

        // Plant a prior install to refuse against.
        runInstallShortcuts({
          home: tmp,
          scheme: 'C',
          pluginVersion: '0.0.0',
        });

        const stderr: string[] = [];
        const exitCalls: number[] = [];

        console.error = (message?: unknown) => {
          stderr.push(String(message ?? ''));
        };
        console.log = () => {
          /* swallow stdout */
        };
        process.exit = ((code?: string | number | null) => {
          exitCalls.push(Number(code ?? 0));
          throw new Error(`exit:${code ?? 0}`);
        }) as typeof process.exit;

        await expect(installShortcuts(['--scheme=B'])).rejects.toThrow(/exit:2/);
        expect(exitCalls).toEqual([2]);
        expect(stderr.join('\n')).toMatch(/prior deskwork shortcuts manifest/i);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        console.error = originalError;
        console.log = originalLog;
        process.exit = originalExit;
      }
    });
  });

  describe('regression: cleanup pattern', () => {
    it('after a clean install + uninstall (--replace), the commands directory is clean of dw- entries', () => {
      // Install scheme C, then install scheme C again with --replace.
      runInstallShortcuts({ home: tmp, scheme: 'C', pluginVersion: '0.0.0' });
      const before = readdirSync(commandsDir(tmp)).sort();
      expect(before).toContain('dw-implement.md');

      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
        replace: true,
      });

      const after = readdirSync(commandsDir(tmp)).sort();
      expect(after).toContain('dw-implement.md');
      // Same number of dw- files; --replace removed prior set, wrote fresh set.
      const dwFilesBefore = before.filter((f) => f.startsWith('dw-'));
      const dwFilesAfter = after.filter((f) => f.startsWith('dw-'));
      expect(dwFilesAfter).toEqual(dwFilesBefore);
    });
  });
});
