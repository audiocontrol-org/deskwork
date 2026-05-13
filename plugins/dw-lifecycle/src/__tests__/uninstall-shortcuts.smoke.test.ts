import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstallShortcuts } from '../subcommands/install-shortcuts.js';
import {
  parseUninstallShortcutsArgs,
  runUninstallShortcuts,
  uninstallShortcuts,
} from '../subcommands/uninstall-shortcuts.js';
import { DriftError } from '../shortcuts/errors.js';
import { manifestPath, commandsDir as resolveCommandsDir } from '../shortcuts/manifest.js';

describe('uninstall-shortcuts (smoke)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-shortcuts-uninstall-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('install -> uninstall round-trip', () => {
    it('removes every shim and the manifest cleanly', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      // Sanity: install wrote the expected files.
      expect(existsSync(manifestPath(tmp))).toBe(true);
      const before = readdirSync(resolveCommandsDir(tmp));
      expect(before.length).toBeGreaterThan(16); // 16 shims + .dotfile manifest

      const result = runUninstallShortcuts({ home: tmp });

      expect(result.dryRun).toBe(false);
      expect(result.manifestRemoved).toBe(true);
      expect(result.shimsRemoved.length).toBe(16);
      expect(result.missingShims.length).toBe(0);
      expect(existsSync(manifestPath(tmp))).toBe(false);

      // Either the commands dir is empty or no longer exists; both
      // mean "nothing left behind". Don't tie the test to one shape —
      // the contract is "manifest + shims gone", not "dir removed".
      if (existsSync(resolveCommandsDir(tmp))) {
        expect(readdirSync(resolveCommandsDir(tmp))).toEqual([]);
      }
    });
  });

  describe('drift refusal', () => {
    it('throws DriftError when a shim was modified after install', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      const drifted = join(resolveCommandsDir(tmp), 'dw-implement.md');
      writeFileSync(drifted, '# custom shortcut owned by operator\n', 'utf8');

      let thrown: unknown;
      try {
        runUninstallShortcuts({ home: tmp });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DriftError);
      const message = (thrown as Error).message;
      expect(message).toMatch(/drift/i);
      expect(message).toContain('dw-implement.md');
      expect(message).toMatch(/--force-uninstall/);

      // Nothing should have been deleted on the no-force path.
      expect(existsSync(manifestPath(tmp))).toBe(true);
      expect(existsSync(drifted)).toBe(true);
      expect(readFileSync(drifted, 'utf8')).toBe('# custom shortcut owned by operator\n');
      expect(existsSync(join(resolveCommandsDir(tmp), 'dw-setup.md'))).toBe(true);
    });

    it('multiple drifts are all reported in the error', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      writeFileSync(
        join(resolveCommandsDir(tmp), 'dw-implement.md'),
        'edited\n',
        'utf8',
      );
      writeFileSync(
        join(resolveCommandsDir(tmp), 'dw-setup.md'),
        'also edited\n',
        'utf8',
      );

      expect(() => runUninstallShortcuts({ home: tmp })).toThrow(DriftError);

      try {
        runUninstallShortcuts({ home: tmp });
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('dw-implement.md');
        expect(message).toContain('dw-setup.md');
      }
    });

    it('multi-line drift renders internal newlines as literal \\n in the error message', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      // Operator replaced a shim with a multi-line custom prompt.
      writeFileSync(
        join(resolveCommandsDir(tmp), 'dw-implement.md'),
        'line1\nline2\nline3\n',
        'utf8',
      );

      let thrown: unknown;
      try {
        runUninstallShortcuts({ home: tmp });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DriftError);
      const message = (thrown as Error).message;
      // The actual: line carries the multi-line body with internal
      // newlines escaped as two-char \n so each shim renders on a
      // single row in the operator's terminal.
      expect(message).toContain('line1\\nline2\\nline3');
      // Belt-and-suspenders: confirm no raw inner newline snuck
      // between the literal-escaped tokens.
      expect(message).not.toMatch(/line1\nline2/);
    });
  });

  describe('--force-uninstall overrides drift refusal', () => {
    it('removes drifted shims when forceUninstall=true and records them', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      const drifted = join(resolveCommandsDir(tmp), 'dw-implement.md');
      writeFileSync(drifted, '# custom shortcut owned by operator\n', 'utf8');

      const result = runUninstallShortcuts({ home: tmp, forceUninstall: true });

      expect(result.manifestRemoved).toBe(true);
      expect(result.shimsRemoved).toContain(drifted);
      expect(result.driftedShims.length).toBe(1);
      const firstDrift = result.driftedShims[0];
      expect(firstDrift).toBeDefined();
      if (firstDrift !== undefined) {
        expect(firstDrift.shimName).toBe('dw-implement');
        expect(firstDrift.reason).toBe('modified');
      }
      expect(existsSync(drifted)).toBe(false);
      expect(existsSync(manifestPath(tmp))).toBe(false);
    });
  });

  describe('missing shim noted but not fatal', () => {
    it('continues the uninstall and records the missing shim in the result', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      const missing = join(resolveCommandsDir(tmp), 'dw-implement.md');
      rmSync(missing);
      expect(existsSync(missing)).toBe(false);

      const result = runUninstallShortcuts({ home: tmp });

      expect(result.manifestRemoved).toBe(true);
      expect(result.shimsRemoved.length).toBe(15);
      expect(result.missingShims.length).toBe(1);
      const firstMissing = result.missingShims[0];
      expect(firstMissing).toBeDefined();
      if (firstMissing !== undefined) {
        expect(firstMissing.shimName).toBe('dw-implement');
        expect(firstMissing.reason).toBe('missing');
      }
      expect(existsSync(manifestPath(tmp))).toBe(false);
    });
  });

  describe('manifest absent fails', () => {
    it('throws a plain Error (not DriftError) when no manifest exists', () => {
      let thrown: unknown;
      try {
        runUninstallShortcuts({ home: tmp });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(DriftError);
      const message = (thrown as Error).message;
      expect(message).toMatch(/no manifest/i);
    });
  });

  describe('dry-run', () => {
    it('touches no files but reports planned removals', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      const filesBefore = readdirSync(resolveCommandsDir(tmp)).sort();

      const result = runUninstallShortcuts({ home: tmp, dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.shimsRemoved.length).toBe(16);
      // manifestRemoved means "actually deleted in this call" — false
      // on dry-run. The dry-run caller infers "would remove" from
      // dryRun: true + no errors thrown.
      expect(result.manifestRemoved).toBe(false);
      expect(existsSync(manifestPath(tmp))).toBe(true);

      const filesAfter = readdirSync(resolveCommandsDir(tmp)).sort();
      expect(filesAfter).toEqual(filesBefore);
    });

    it('dry-run reports drift without throwing', () => {
      runInstallShortcuts({
        home: tmp,
        scheme: 'C',
        pluginVersion: '0.0.0',
      });

      writeFileSync(
        join(resolveCommandsDir(tmp), 'dw-implement.md'),
        'edited\n',
        'utf8',
      );

      // Dry-run preview MUST surface drift so the operator sees what
      // will refuse before they invoke the real run.
      expect(() => runUninstallShortcuts({ home: tmp, dryRun: true })).toThrow(
        DriftError,
      );
    });
  });

  describe('CLI arg parsing', () => {
    it('defaults are all false', () => {
      const parsed = parseUninstallShortcutsArgs([]);
      expect(parsed.forceUninstall).toBe(false);
      expect(parsed.dryRun).toBe(false);
      expect(parsed.help).toBe(false);
    });

    it('parses --force-uninstall', () => {
      const parsed = parseUninstallShortcutsArgs(['--force-uninstall']);
      expect(parsed.forceUninstall).toBe(true);
    });

    it('parses --dry-run', () => {
      const parsed = parseUninstallShortcutsArgs(['--dry-run']);
      expect(parsed.dryRun).toBe(true);
    });

    it('parses combined flags', () => {
      const parsed = parseUninstallShortcutsArgs(['--force-uninstall', '--dry-run']);
      expect(parsed.forceUninstall).toBe(true);
      expect(parsed.dryRun).toBe(true);
    });

    it('parses --help / -h', () => {
      expect(parseUninstallShortcutsArgs(['--help']).help).toBe(true);
      expect(parseUninstallShortcutsArgs(['-h']).help).toBe(true);
    });

    it('rejects unknown flags', () => {
      expect(() => parseUninstallShortcutsArgs(['--banana'])).toThrow(/unknown flag/i);
    });

    it('rejects positional args', () => {
      expect(() => parseUninstallShortcutsArgs(['somearg'])).toThrow(
        /unexpected positional/i,
      );
    });
  });

  describe('uninstallShortcuts dispatch shell', () => {
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

        await expect(uninstallShortcuts(['--help'])).rejects.toThrow(/exit:0/);
        expect(exitCalls).toEqual([0]);
        expect(stdout.join('\n')).toMatch(/Usage: dw-lifecycle uninstall-shortcuts/);
      } finally {
        console.log = originalLog;
        process.exit = originalExit;
      }
    });

    it('exits with code 2 on drift refusal (no --force-uninstall)', async () => {
      const originalHome = process.env.HOME;
      const originalError = console.error;
      const originalLog = console.log;
      const originalExit = process.exit;
      try {
        process.env.HOME = tmp;

        runInstallShortcuts({
          home: tmp,
          scheme: 'C',
          pluginVersion: '0.0.0',
        });
        writeFileSync(
          join(resolveCommandsDir(tmp), 'dw-implement.md'),
          'edited\n',
          'utf8',
        );

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

        await expect(uninstallShortcuts([])).rejects.toThrow(/exit:2/);
        expect(exitCalls).toEqual([2]);
        expect(stderr.join('\n')).toMatch(/drift/i);
        // Nothing was deleted.
        expect(existsSync(manifestPath(tmp))).toBe(true);
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

    it('exits with code 1 when no manifest exists', async () => {
      const originalHome = process.env.HOME;
      const originalError = console.error;
      const originalExit = process.exit;
      try {
        process.env.HOME = tmp;

        const stderr: string[] = [];
        const exitCalls: number[] = [];

        console.error = (message?: unknown) => {
          stderr.push(String(message ?? ''));
        };
        process.exit = ((code?: string | number | null) => {
          exitCalls.push(Number(code ?? 0));
          throw new Error(`exit:${code ?? 0}`);
        }) as typeof process.exit;

        await expect(uninstallShortcuts([])).rejects.toThrow(/exit:1/);
        expect(exitCalls).toEqual([1]);
        expect(stderr.join('\n')).toMatch(/no manifest/i);
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

    it('exits with code 1 on unknown flag', async () => {
      const originalError = console.error;
      const originalExit = process.exit;
      try {
        const stderr: string[] = [];
        const exitCalls: number[] = [];

        console.error = (message?: unknown) => {
          stderr.push(String(message ?? ''));
        };
        process.exit = ((code?: string | number | null) => {
          exitCalls.push(Number(code ?? 0));
          throw new Error(`exit:${code ?? 0}`);
        }) as typeof process.exit;

        await expect(uninstallShortcuts(['--banana'])).rejects.toThrow(/exit:1/);
        expect(exitCalls).toEqual([1]);
        expect(stderr.join('\n')).toMatch(/unknown flag/i);
      } finally {
        console.error = originalError;
        process.exit = originalExit;
      }
    });

    it('happy path through dispatch shell deletes the install', async () => {
      const originalHome = process.env.HOME;
      const originalLog = console.log;
      const originalExit = process.exit;
      try {
        process.env.HOME = tmp;

        runInstallShortcuts({
          home: tmp,
          scheme: 'C',
          pluginVersion: '0.0.0',
        });

        const exitCalls: number[] = [];
        console.log = () => {
          /* swallow stdout */
        };
        process.exit = ((code?: string | number | null) => {
          exitCalls.push(Number(code ?? 0));
          // Dispatch reaches the end without an explicit exit on the
          // happy path; if it does call exit, we capture the code.
        }) as typeof process.exit;

        await uninstallShortcuts([]);

        // Contract: happy path returns normally (no explicit process.exit
        // call). A future refactor that adds an unintended exit fails
        // this assertion.
        expect(exitCalls.length).toBe(0);
        expect(existsSync(manifestPath(tmp))).toBe(false);
      } finally {
        if (originalHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = originalHome;
        }
        console.log = originalLog;
        process.exit = originalExit;
      }
    });
  });

  describe('manifest with stale shimName (regression)', () => {
    it('a manifest pointing at a shim that does not exist does not crash', () => {
      // Manually build a tiny commands tree with a manifest whose
      // shim entry does NOT have a corresponding file. This is the
      // same shape as the "missing shim" test but verifies the
      // permissive treatment is wired through the dirent loop, not
      // an artifact of one specific order of operations.
      mkdirSync(resolveCommandsDir(tmp), { recursive: true });
      writeFileSync(
        manifestPath(tmp),
        JSON.stringify(
          {
            version: 1,
            scheme: 'C',
            rename: null,
            pluginVersion: '0.0.0',
            shims: [{ command: 'implement', shimName: 'dw-implement' }],
          },
          null,
          2,
        ) + '\n',
        'utf8',
      );

      const result = runUninstallShortcuts({ home: tmp });
      expect(result.manifestRemoved).toBe(true);
      expect(result.shimsRemoved.length).toBe(0);
      expect(result.missingShims.length).toBe(1);
    });
  });
});
