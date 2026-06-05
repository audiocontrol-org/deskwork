import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'cli.ts');
const TSX = resolve(here, '..', '..', '..', '..', 'node_modules', '.bin', 'tsx');

function runCli(args: string[]) {
  return spawnSync(TSX, [CLI, ...args], { encoding: 'utf8' });
}

describe('stackctl dispatcher (T008)', () => {
  it('exits 2 with a usage line listing known verbs on an unknown verb', () => {
    const r = runCli(['no-such-verb']);
    expect(r.status).toBe(2);
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toMatch(/usage:/i);
    // The usage line must enumerate the known verbs so the operator can
    // recover; at minimum `version` (Phase 2) is listed.
    expect(out).toMatch(/version/);
  });

  it('prints usage on no-arg invocation', () => {
    const r = runCli([]);
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toMatch(/usage:/i);
    // Bare invocation is an error (no verb to dispatch).
    expect(r.status).not.toBe(0);
  });

  it('does not silently ignore an unknown verb (non-zero exit)', () => {
    const r = runCli(['bogus']);
    expect(r.status).not.toBe(0);
  });
});
