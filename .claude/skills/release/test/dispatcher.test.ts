import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRig } from './fixtures.js';

const HELPERS_TS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'lib',
  'release-helpers.ts',
);

function runHelper(args: readonly string[], cwd?: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('tsx', [HELPERS_TS, ...args], {
      cwd: cwd ?? process.cwd(),
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

describe('CLI dispatcher', () => {
  it('validate-version: exits 0 on valid', () => {
    const r = runHelper(['validate-version', '0.9.0', 'v0.8.7']);
    expect(r.status).toBe(0);
  });

  it('validate-version: exits 1 on invalid with reason on stderr', () => {
    const r = runHelper(['validate-version', '0.8.6', 'v0.8.7']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/strictly greater/i);
  });

  it('check-preconditions: prints structured report and exits with appropriate code', () => {
    const rig = createRig();
    try {
      const r = runHelper(['check-preconditions'], rig.localPath);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/HEAD:/);
      expect(r.stdout).toMatch(/Working tree:/);
    } finally {
      rig.cleanup();
    }
  });

  it('unknown subcommand: exits 2 with stderr', () => {
    const r = runHelper(['nonsense-subcommand']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown subcommand/i);
  });
});
