import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CLI_TS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'cli.ts',
);

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

function runCli(args: readonly string[]): CliResult {
  try {
    const stdout = execFileSync('tsx', [CLI_TS, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    if (
      err instanceof Error &&
      'stdout' in err &&
      'stderr' in err &&
      'status' in err
    ) {
      const raw = err as Error & { stdout?: Buffer; stderr?: Buffer; status?: number };
      return {
        stdout: Buffer.isBuffer(raw.stdout) ? raw.stdout.toString() : '',
        stderr: Buffer.isBuffer(raw.stderr) ? raw.stderr.toString() : '',
        status: typeof raw.status === 'number' ? raw.status : 1,
      };
    }
    return { stdout: '', stderr: err instanceof Error ? err.message : String(err), status: 1 };
  }
}

describe('dw-lifecycle CLI dispatcher', () => {
  it('--help prints usage to stdout and exits 0', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage: dw-lifecycle/);
    expect(r.stdout).toMatch(/Subcommands:/);
    expect(r.stderr).toBe('');
  });

  it('-h prints usage to stdout and exits 0', () => {
    const r = runCli(['-h']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage: dw-lifecycle/);
  });

  it('help prints usage to stdout and exits 0', () => {
    const r = runCli(['help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage: dw-lifecycle/);
  });

  it('bare invocation (no subcommand) prints usage to stderr and exits 1', () => {
    const r = runCli([]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/Usage: dw-lifecycle/);
  });

  it('unknown subcommand exits 1 with reason on stderr', () => {
    const r = runCli(['banana-not-a-real-subcommand']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Unknown subcommand: banana-not-a-real-subcommand/);
  });
});
