import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { install, parseInstallArgs, probeInstallConfig } from '../subcommands/install.js';

describe('install (smoke)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-lifecycle-install-'));
    execSync('git init', { cwd: tmp, stdio: 'ignore' });
    execSync('git config user.email "test@test"', { cwd: tmp });
    execSync('git config user.name "Test"', { cwd: tmp });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a default config to .dw-lifecycle/config.json', async () => {
    await install([tmp]);
    const cfgPath = join(tmp, '.dw-lifecycle/config.json');
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(cfg.version).toBe(1);
    expect(cfg.docs.byVersion).toBe(true);
    expect(cfg.tracking.platform).toBe('github');
  });

  it('probes existing docs/<version>/<status>/ shape and seeds knownVersions', () => {
    mkdirSync(join(tmp, 'docs/1.0/001-IN-PROGRESS/example'), { recursive: true });
    mkdirSync(join(tmp, 'docs/2.0/003-COMPLETE/old-example'), { recursive: true });

    const cfg = probeInstallConfig(tmp);
    expect(cfg.docs.byVersion).toBe(true);
    expect(cfg.docs.knownVersions).toEqual(['1.0', '2.0']);
    expect(cfg.docs.defaultTargetVersion).toBe('1.0');
  });

  it('supports --dry-run without writing config.json', async () => {
    await install([tmp, '--dry-run']);
    expect(existsSync(join(tmp, '.dw-lifecycle'))).toBe(false);
    expect(existsSync(join(tmp, '.dw-lifecycle/config.json'))).toBe(false);
  });

  it('rejects unknown flags instead of treating them as positional args', () => {
    expect(() => parseInstallArgs(['--banana'])).toThrow(/Unknown flag: --banana/);
  });

  it('--config-overlay deep-merges JSON onto the probed config (#211)', async () => {
    mkdirSync(join(tmp, 'docs/1.0/001-IN-PROGRESS/example'), { recursive: true });
    mkdirSync(join(tmp, 'docs/1.0/002-BLOCKED'), { recursive: true });

    const overlayPath = join(tmp, 'overlay.json');
    writeFileSync(
      overlayPath,
      JSON.stringify(
        {
          docs: {
            statusDirs: { waiting: '002-BLOCKED' },
            knownVersions: ['1.0', '2.0'],
          },
          worktrees: { naming: '<repo>-feat-<slug>' },
        },
        null,
        2,
      ),
      'utf8',
    );

    await install([tmp, '--config-overlay', overlayPath]);

    const cfg = JSON.parse(readFileSync(join(tmp, '.dw-lifecycle/config.json'), 'utf8'));
    // Overlay overrides win.
    expect(cfg.docs.statusDirs.waiting).toBe('002-BLOCKED');
    expect(cfg.docs.knownVersions).toEqual(['1.0', '2.0']);
    expect(cfg.worktrees.naming).toBe('<repo>-feat-<slug>');
    // Non-overridden fields preserved from the probed defaults.
    expect(cfg.docs.statusDirs.inProgress).toBe('001-IN-PROGRESS');
    expect(cfg.docs.statusDirs.complete).toBe('003-COMPLETE');
    expect(cfg.tracking.platform).toBe('github');
    expect(cfg.branches.prefix).toBe('feature/');
  });

  it('--config-overlay rejects a missing file', async () => {
    await expect(install([tmp, '--config-overlay', join(tmp, 'no-such.json')])).rejects.toThrow(
      /Config overlay file not found/,
    );
    expect(existsSync(join(tmp, '.dw-lifecycle/config.json'))).toBe(false);
  });

  it('--config-overlay rejects malformed JSON', async () => {
    const overlayPath = join(tmp, 'bad.json');
    writeFileSync(overlayPath, '{not valid json', 'utf8');
    await expect(install([tmp, '--config-overlay', overlayPath])).rejects.toThrow(
      /Config overlay parse failed/,
    );
  });

  it('prints help without requiring a git repo or writing config', async () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'dw-lifecycle-install-help-'));
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

      await expect(install([nonRepo, '--help'])).rejects.toThrow(/exit:0/);
      expect(exitCalls).toEqual([0]);
      expect(stdout.join('\n')).toMatch(/Usage: dw-lifecycle install/);
      expect(existsSync(join(nonRepo, '.dw-lifecycle/config.json'))).toBe(false);
    } finally {
      console.log = originalLog;
      process.exit = originalExit;
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});
