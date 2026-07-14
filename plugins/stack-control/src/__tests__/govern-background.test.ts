// impl:fix/audit-barrage-cc-timeout — govern background launch/status.
//
// The bug: `stackctl govern` is run as a blocking FOREGROUND process from
// within a Claude Code Bash tool call, but a govern pass (frontier-model
// barrage rounds × chunked payloads × convergence loops) routinely exceeds
// Claude Code's Bash-tool timeout ceiling (max 600s), so the harness kills
// govern mid-run. The fix decouples govern's lifetime from the foreground
// call: a DETACHED launcher forks the real govern into its own session and
// returns immediately with a handle; a status verb polls the handle's
// result. These tests pin the launcher / runner / status contract with
// dependency-injected spawn seams (no real long-running processes).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classifyBackgroundRun,
  runBackgroundLaunch,
  runBackgroundRunner,
  readBackgroundStatus,
  resolveHandleDir,
  STATUS_RUNNING_EXIT,
  BACKGROUND_SUBDIR,
} from '../govern/background.js';
import { parseFlags } from '../govern/govern-vars.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'govern-bg-'));
  mkdirSync(join(root, '.stack-control'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('classifyBackgroundRun', () => {
  it('a completed run reports its recorded govern exit code (gate OPEN → 0)', () => {
    expect(
      classifyBackgroundRun({ handleExists: true, resultExitCode: 0, pidAlive: false }),
    ).toEqual({ state: 'completed', exitCode: 0 });
  });

  it('a completed run reports a BLOCKED gate verdict (exit 1)', () => {
    expect(
      classifyBackgroundRun({ handleExists: true, resultExitCode: 1, pidAlive: false }),
    ).toEqual({ state: 'completed', exitCode: 1 });
  });

  it('an in-flight run (no result yet, pid alive) is running — EX_TEMPFAIL so a poll loop retries', () => {
    expect(
      classifyBackgroundRun({ handleExists: true, resultExitCode: null, pidAlive: true }),
    ).toEqual({ state: 'running', exitCode: STATUS_RUNNING_EXIT });
  });

  it('a dead pid with no result is a crash (fatal 2), never mistaken for done', () => {
    expect(
      classifyBackgroundRun({ handleExists: true, resultExitCode: null, pidAlive: false }),
    ).toEqual({ state: 'died', exitCode: 2 });
  });

  it('an unknown handle is fatal (2)', () => {
    expect(
      classifyBackgroundRun({ handleExists: false, resultExitCode: null, pidAlive: false }),
    ).toEqual({ state: 'unknown', exitCode: 2 });
  });
});

describe('runBackgroundLaunch', () => {
  it('creates a handle dir, writes handle.json, spawns a DETACHED runner, and returns before the run finishes', () => {
    const calls: Array<{ cmd: string; args: readonly string[]; detached: boolean }> = [];
    const handle = runBackgroundLaunch(['--mode', 'implement'], root, {
      cwd: '/some/work/dir',
      now: () => new Date('2026-07-14T12:00:00.000Z'),
      randSuffix: () => 'abcd',
      spawnDetached: (cmd, args, opts) => {
        calls.push({ cmd, args, detached: opts.detached });
        return { pid: 4242 };
      },
      runnerCmd: ['/bin/stackctl', 'govern', '--__bg-run'],
    });

    // Returned handle record.
    expect(handle.pid).toBe(4242);
    expect(handle.governArgs).toEqual(['--mode', 'implement']);
    expect(handle.cwd).toBe('/some/work/dir');

    // Handle dir + persisted record.
    const handleDir = join(root, '.stack-control', BACKGROUND_SUBDIR, handle.handle);
    expect(existsSync(handleDir)).toBe(true);
    const persisted = JSON.parse(readFileSync(join(handleDir, 'handle.json'), 'utf8'));
    expect(persisted.pid).toBe(4242);
    expect(persisted.governArgs).toEqual(['--mode', 'implement']);
    expect(persisted.cwd).toBe('/some/work/dir');

    // The runner was spawned detached, pointed at THIS handle dir.
    expect(calls).toHaveLength(1);
    expect(calls[0].detached).toBe(true);
    expect(calls[0].cmd).toBe('/bin/stackctl');
    expect(calls[0].args).toEqual(['govern', '--__bg-run', handleDir]);
  });

  it('strips --background from the forwarded govern args so the detached runner cannot re-background (no fork bomb)', () => {
    const handle = runBackgroundLaunch(['--mode', 'implement', '--background', '--item', 'x'], root, {
      cwd: root,
      spawnDetached: () => ({ pid: 1 }),
      runnerCmd: ['stackctl', 'govern', '--__bg-run'],
    });
    expect(handle.governArgs).toEqual(['--mode', 'implement', '--item', 'x']);
  });
});

describe('runBackgroundRunner', () => {
  it('runs govern to completion and records the govern exit code in result.json', () => {
    // Seed a handle dir as the launcher would have.
    const handle = runBackgroundLaunch(['--mode', 'implement'], root, {
      cwd: root,
      spawnDetached: () => ({ pid: 1 }),
      runnerCmd: ['stackctl', 'govern', '--__bg-run'],
    });
    const handleDir = join(root, '.stack-control', BACKGROUND_SUBDIR, handle.handle);

    let forwarded: { cmd: readonly string[]; governArgs: readonly string[]; cwd: string } | null = null;
    const result = runBackgroundRunner(handleDir, {
      now: () => new Date('2026-07-14T12:05:00.000Z'),
      governCmd: ['stackctl', 'govern'],
      runGovernForeground: (input) => {
        forwarded = { cmd: input.cmd, governArgs: input.governArgs, cwd: input.cwd };
        return { status: 1, signal: null };
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.finishedAt).toBe('2026-07-14T12:05:00.000Z');
    // The runner forwarded exactly the stored govern args + cwd.
    expect(forwarded).not.toBeNull();
    expect(forwarded!.governArgs).toEqual(['--mode', 'implement']);
    expect(forwarded!.cwd).toBe(root);

    // result.json is persisted for the status verb.
    const persisted = JSON.parse(readFileSync(join(handleDir, 'result.json'), 'utf8'));
    expect(persisted.exitCode).toBe(1);
  });

  it('records a signal-killed govern child as a non-zero exit (never 0)', () => {
    const handle = runBackgroundLaunch(['--mode', 'implement'], root, {
      cwd: root,
      spawnDetached: () => ({ pid: 1 }),
      runnerCmd: ['stackctl', 'govern', '--__bg-run'],
    });
    const handleDir = join(root, '.stack-control', BACKGROUND_SUBDIR, handle.handle);
    const result = runBackgroundRunner(handleDir, {
      runGovernForeground: () => ({ status: null, signal: 'SIGKILL' }),
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.signal).toBe('SIGKILL');
  });
});

describe('readBackgroundStatus', () => {
  function seedHandle(pid: number): string {
    const handle = runBackgroundLaunch(['--mode', 'implement'], root, {
      cwd: root,
      spawnDetached: () => ({ pid }),
      runnerCmd: ['stackctl', 'govern', '--__bg-run'],
    });
    return join(root, '.stack-control', BACKGROUND_SUBDIR, handle.handle);
  }

  it('reports running (EX_TEMPFAIL) while the pid is alive and no result exists', () => {
    const handleDir = seedHandle(9999);
    const report = readBackgroundStatus(handleDir, { pidAlive: () => true });
    expect(report.classification).toEqual({ state: 'running', exitCode: STATUS_RUNNING_EXIT });
  });

  it('reports the completed govern verdict once result.json lands', () => {
    const handleDir = seedHandle(9999);
    writeFileSync(
      join(handleDir, 'result.json'),
      JSON.stringify({ exitCode: 0, finishedAt: '2026-07-14T12:05:00.000Z' }),
      'utf8',
    );
    const report = readBackgroundStatus(handleDir, { pidAlive: () => false });
    expect(report.classification).toEqual({ state: 'completed', exitCode: 0 });
  });

  it('surfaces the barrage run-dir parsed from the govern log', () => {
    const handleDir = seedHandle(9999);
    writeFileSync(
      join(handleDir, 'govern.log'),
      'some preamble\ngovern: barrage run-dir = /tmp/installation/.stack-control/audit-runs/RUN\nmore\n',
      'utf8',
    );
    writeFileSync(join(handleDir, 'result.json'), JSON.stringify({ exitCode: 1, finishedAt: 'x' }), 'utf8');
    const report = readBackgroundStatus(handleDir, { pidAlive: () => false });
    expect(report.runDir).toBe('/tmp/installation/.stack-control/audit-runs/RUN');
  });

  it('reports a crash (died, fatal 2) when the pid is gone but no result was written', () => {
    const handleDir = seedHandle(9999);
    const report = readBackgroundStatus(handleDir, { pidAlive: () => false });
    expect(report.classification).toEqual({ state: 'died', exitCode: 2 });
  });
});

describe('govern parseFlags — background flags', () => {
  it('accepts --background as a boolean', () => {
    const r = parseFlags(['--mode', 'implement', '--background']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flags.background).toBe(true);
  });

  it('accepts --status as a boolean with an optional --handle value', () => {
    const r = parseFlags(['--status', '--handle', 'H-123']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.flags.status).toBe(true);
      expect(r.flags.handle).toBe('H-123');
    }
  });

  it('accepts the internal --__bg-run <dir> runner flag', () => {
    const r = parseFlags(['--__bg-run', '/tmp/handle-dir']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flags.bgRun).toBe('/tmp/handle-dir');
  });

  it('defaults the background flags off', () => {
    const r = parseFlags(['--mode', 'implement']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.flags.background).toBe(false);
      expect(r.flags.status).toBe(false);
      expect(r.flags.bgRun).toBeUndefined();
    }
  });
});

describe('resolveHandleDir', () => {
  it('resolves an explicit handle id under the installation background store', () => {
    const handle = runBackgroundLaunch(['--mode', 'implement'], root, {
      cwd: root,
      spawnDetached: () => ({ pid: 1 }),
      runnerCmd: ['stackctl', 'govern', '--__bg-run'],
    });
    expect(resolveHandleDir(root, handle.handle)).toBe(
      join(root, '.stack-control', BACKGROUND_SUBDIR, handle.handle),
    );
  });

  it('resolves the NEWEST handle when none is named (the just-launched run)', () => {
    const first = runBackgroundLaunch(['--mode', 'implement'], root, {
      cwd: root,
      now: () => new Date('2026-07-14T12:00:00.000Z'),
      randSuffix: () => 'aaaa',
      spawnDetached: () => ({ pid: 1 }),
      runnerCmd: ['stackctl', 'govern', '--__bg-run'],
    });
    const second = runBackgroundLaunch(['--mode', 'implement'], root, {
      cwd: root,
      now: () => new Date('2026-07-14T12:30:00.000Z'),
      randSuffix: () => 'bbbb',
      spawnDetached: () => ({ pid: 2 }),
      runnerCmd: ['stackctl', 'govern', '--__bg-run'],
    });
    expect(first.handle).not.toBe(second.handle);
    expect(resolveHandleDir(root, undefined)).toBe(
      join(root, '.stack-control', BACKGROUND_SUBDIR, second.handle),
    );
  });

  it('returns undefined for an unknown handle id', () => {
    expect(resolveHandleDir(root, 'does-not-exist')).toBeUndefined();
  });
});
