/**
 * Sidecar boot tests — exercises the `deskwork-bridge` bin against a
 * tmp-fixture project root and asserts the documented contract:
 *
 *   1. Bound port serves `/api/chat/state` with the documented JSON shape.
 *   2. Descriptor file lands at `<projectRoot>/.deskwork/.bridge` with
 *      schema `{port, pid, startedAt, version}`.
 *   3. Booting a SECOND sidecar against the same project root errors
 *      cleanly (not a silent port collision).
 *   4. Booting against a STALE descriptor (dead pid, free port)
 *      recovers and overwrites — no error.
 *
 * These tests spawn the sidecar via `tsx` so they exercise the real
 * argv-parsing + bind path, not just the in-process app factory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDescriptor, descriptorPath } from '@/descriptor.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(HERE, '..', 'src', 'server.ts');
const TSX_BIN = resolve(HERE, '..', '..', '..', 'node_modules', '.bin', 'tsx');

interface SpawnedSidecar {
  child: ChildProcess;
  port: number;
  stdoutBuf: string;
  stderrBuf: string;
}

interface ProjectFixture {
  root: string;
  cleanup: () => void;
}

function makeProjectFixture(): ProjectFixture {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-bridge-boot-'));
  mkdirSync(join(root, '.deskwork'), { recursive: true });
  const config = {
    version: 1,
    sites: {
      smoke: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'smoke',
  };
  writeFileSync(
    join(root, '.deskwork', 'config.json'),
    JSON.stringify(config, null, 2),
    'utf8',
  );
  writeFileSync(
    join(root, '.deskwork', 'calendar.md'),
    'Smoke calendar\n\n(empty)\n',
    'utf8',
  );
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

interface SpawnOptions {
  readonly projectRoot: string;
  readonly port: number;
  readonly explicitPort?: boolean;
}

function spawnSidecar(opts: SpawnOptions): SpawnedSidecar {
  const args: string[] = [
    SERVER_PATH,
    '--project-root',
    opts.projectRoot,
    '--no-tailscale',
  ];
  if (opts.explicitPort !== false) {
    args.push('--port', String(opts.port));
  }
  const child = spawn(TSX_BIN, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const result: SpawnedSidecar = {
    child,
    port: opts.port,
    stdoutBuf: '',
    stderrBuf: '',
  };
  child.stdout?.on('data', (chunk: Buffer) => {
    result.stdoutBuf += chunk.toString('utf8');
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    result.stderrBuf += chunk.toString('utf8');
  });
  return result;
}

async function waitForListening(
  s: SpawnedSidecar,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (s.stdoutBuf.includes('listening on:')) return true;
    if (s.child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function waitForExit(
  s: SpawnedSidecar,
  timeoutMs: number,
): Promise<number | null> {
  if (s.child.exitCode !== null) return s.child.exitCode;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (s.child.exitCode !== null) return s.child.exitCode;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function killSidecar(s: SpawnedSidecar): Promise<void> {
  if (s.child.exitCode !== null) return;
  s.child.kill('SIGTERM');
  // Give cleanup handlers a chance to remove the descriptor.
  for (let i = 0; i < 30; i += 1) {
    if (s.child.exitCode !== null) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  s.child.kill('SIGKILL');
}

// Pick a port unique to this test invocation to avoid collisions with
// concurrent vitest workers / a real sidecar the operator may have
// running on 47321 in another shell.
function pickPort(seed: number): number {
  // High range, well outside the canonical 47321 default. The +seed
  // disambiguates concurrent test cases inside this file.
  return 51000 + (process.pid % 200) + seed;
}

interface BridgeStateBody {
  mcpConnected: unknown;
  listenModeOn: unknown;
  awaitingMessage: unknown;
}

function isBridgeStateBody(value: unknown): value is BridgeStateBody {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return (
    'mcpConnected' in value &&
    'listenModeOn' in value &&
    'awaitingMessage' in value
  );
}

describe('deskwork-bridge: sidecar boot + descriptor', () => {
  let fx: ProjectFixture;
  const spawned: SpawnedSidecar[] = [];

  beforeEach(() => {
    fx = makeProjectFixture();
  });

  afterEach(async () => {
    for (const s of spawned) {
      await killSidecar(s);
    }
    spawned.length = 0;
    fx.cleanup();
  });

  it('boots, serves /api/chat/state, writes the descriptor', async () => {
    const port = pickPort(1);
    const s = spawnSidecar({ projectRoot: fx.root, port });
    spawned.push(s);
    const ok = await waitForListening(s, 30_000);
    if (!ok) {
      throw new Error(
        `sidecar did not start within timeout. stdout:\n${s.stdoutBuf}\nstderr:\n${s.stderrBuf}`,
      );
    }

    const res = await fetch(`http://127.0.0.1:${port}/api/chat/state`);
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    if (!isBridgeStateBody(body)) {
      throw new Error(`unexpected body shape: ${JSON.stringify(body)}`);
    }
    expect(body.mcpConnected).toBe(false);
    expect(body.listenModeOn).toBe(false);
    expect(body.awaitingMessage).toBe(false);

    const desc = await readDescriptor(fx.root);
    if (desc === null) {
      throw new Error(
        `descriptor missing at ${descriptorPath(fx.root)}; stdout:\n${s.stdoutBuf}`,
      );
    }
    expect(desc.port).toBe(port);
    // The pid in the descriptor is the actual node process; when tsx
    // wraps the script the spawn parent (`s.child.pid`) is tsx itself
    // and the descriptor's pid points at its child. Just assert it's a
    // positive integer.
    expect(Number.isInteger(desc.pid)).toBe(true);
    expect(desc.pid).toBeGreaterThan(0);
    expect(typeof desc.startedAt).toBe('string');
    expect(desc.startedAt.length).toBeGreaterThan(0);
    expect(typeof desc.version).toBe('string');
    expect(desc.version.length).toBeGreaterThan(0);

    // Banner shape: includes the canonical Bridge: line.
    expect(s.stdoutBuf).toMatch(/Bridge: http:\/\/localhost:\d+\/mcp/);
  });

  it('refuses to boot when an existing live sidecar holds the descriptor', async () => {
    const port = pickPort(2);
    const first = spawnSidecar({ projectRoot: fx.root, port });
    spawned.push(first);
    const firstOk = await waitForListening(first, 30_000);
    if (!firstOk) {
      throw new Error(
        `first sidecar did not start. stdout:\n${first.stdoutBuf}\nstderr:\n${first.stderrBuf}`,
      );
    }

    // Second sidecar against the SAME project root, a different port (so
    // the second wouldn't collide on bind — the collision should be
    // detected via the descriptor + health-check, not via EADDRINUSE).
    const second = spawnSidecar({ projectRoot: fx.root, port: port + 100 });
    spawned.push(second);
    const exitCode = await waitForExit(second, 30_000);
    expect(exitCode).toBe(1);
    expect(second.stderrBuf).toMatch(/another sidecar is already running/i);
  });

  it('recovers from a stale descriptor (dead pid, port free)', async () => {
    // Hand-write a stale descriptor pointing at a pid we know is dead.
    // PID 1 (init/launchd) is alive on every system; we need a PID we
    // can guarantee is dead. Spawn a no-op child, capture its pid, wait
    // for it to exit, then use that pid in the descriptor.
    const tmp = spawn(process.execPath, ['-e', '0']);
    const deadPid: number = await new Promise((resolve, reject) => {
      const pid = tmp.pid;
      if (pid === undefined) {
        reject(new Error('failed to spawn temp process'));
        return;
      }
      tmp.on('exit', () => resolve(pid));
    });
    expect(deadPid).toBeGreaterThan(0);

    const stalePort = pickPort(3) + 500;
    const stale = {
      port: stalePort,
      pid: deadPid,
      startedAt: new Date().toISOString(),
      version: '0.0.0-stale',
    };
    writeFileSync(
      descriptorPath(fx.root),
      JSON.stringify(stale),
      'utf8',
    );

    // Boot a fresh sidecar; it should detect the stale descriptor,
    // emit a recovery notice on stderr, and overwrite the descriptor.
    const port = pickPort(3);
    const s = spawnSidecar({ projectRoot: fx.root, port });
    spawned.push(s);
    const ok = await waitForListening(s, 30_000);
    if (!ok) {
      throw new Error(
        `sidecar did not start. stdout:\n${s.stdoutBuf}\nstderr:\n${s.stderrBuf}`,
      );
    }
    expect(s.stderrBuf).toMatch(/stale descriptor/i);

    const desc = await readDescriptor(fx.root);
    if (desc === null) throw new Error('descriptor missing after recovery');
    expect(Number.isInteger(desc.pid)).toBe(true);
    expect(desc.pid).toBeGreaterThan(0);
    expect(desc.pid).not.toBe(deadPid);
    expect(desc.port).toBe(port);
    expect(desc.version).not.toBe('0.0.0-stale');
  });
});
