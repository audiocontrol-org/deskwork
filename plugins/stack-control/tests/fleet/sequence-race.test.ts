// specs/036-fleet-control-plane — AUDIT-20260717-07 (RED-first regression).
//
// THE DEFECT: cli.ts computed the next `installationSequence` as
// `advanceHighWaterMark(location, readHighWaterMark(location) + 1)` — a classic
// read-then-write TOCTOU with no cross-process lock. Two concurrent `stackctl`
// invocations both read N, both compute N+1, both write N+1 (the second falls
// through `advanceHighWaterMark`'s idempotent-no-op branch), and both emit the
// SAME sequence for two DISTINCT invocations — corrupting FR-039's per-
// installation counter that gap classification depends on. This project's own
// execution model dispatches many `stackctl` subcommands in parallel, so
// concurrent same-installation invocations are a common runtime shape.
//
// THE FIX: an ATOMIC `reserveNextSequence` primitive that serializes the
// read-increment-write across processes with an exclusive-create lockfile, so N
// concurrent reservations return N DISTINCT, contiguous values.
//
// Two deterministic tests over REAL concurrent child processes:
//   1. 'naive'  — reproduces the defect: the old read-then-write pattern DOES
//                 collide (this is what the fix removes).
//   2. 'atomic' — proves the fix: reserveNextSequence yields N distinct = {1..N}.
//
// A cross-process FILESYSTEM barrier forces the workers to interleave; the test
// does not rely on simultaneous OS scheduling. Relative `.js` imports.

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { useMachineStateStore, type MachineStateStore } from './_machine-state-harness.js';
import { resolveTsx, PLUGIN_ROOT } from '../../src/__tests__/_run-helpers.js';

const IS_WIN = process.platform === 'win32';
const WORKER = resolve(PLUGIN_ROOT, 'tests', 'fleet', '_sequence-reserve-worker.ts');

function shortTmpBase(): string {
  return IS_WIN ? tmpdir() : '/tmp';
}

/** A real installation-root dir (locate.ts's realpath.native requires it to exist). */
function makeInstallationRoot(): string {
  return mkdtempSync(join(shortTmpBase(), 'scf-seqrace-inst-'));
}

/** Spawn one worker child and resolve its printed sequence value. */
function spawnWorker(
  mode: 'naive' | 'atomic',
  root: string,
  barrierDir: string,
  id: string,
  n: number,
  store: MachineStateStore,
): Promise<number> {
  return new Promise<number>((resolvePromise, reject) => {
    const child = spawn(resolveTsx(), [WORKER], {
      env: {
        ...process.env,
        ...store.env,
        SCF_MODE: mode,
        SCF_ROOT: root,
        SCF_BARRIER: barrierDir,
        SCF_ID: id,
        SCF_N: String(n),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c: string) => (out += c));
    child.stderr.on('data', (c: string) => (err += c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`worker ${id} (${mode}) exited ${code}: ${err || out}`));
        return;
      }
      const value = Number.parseInt(out.trim(), 10);
      if (!Number.isInteger(value)) {
        reject(new Error(`worker ${id} (${mode}) printed non-integer: ${JSON.stringify(out)}`));
        return;
      }
      resolvePromise(value);
    });
  });
}

async function runConcurrent(
  mode: 'naive' | 'atomic',
  store: MachineStateStore,
  n: number,
): Promise<number[]> {
  const root = makeInstallationRoot();
  const barrierDir = mkdtempSync(join(shortTmpBase(), 'scf-seqrace-barrier-'));
  try {
    const workers = Array.from({ length: n }, (_v, i) =>
      spawnWorker(mode, root, barrierDir, `w${i}`, n, store),
    );
    return await Promise.all(workers);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(barrierDir, { recursive: true, force: true });
  }
}

describe('AUDIT-20260717-07 — installationSequence reservation is atomic across concurrent processes', () => {
  const store = useMachineStateStore();
  const N = 6;

  it('DEFECT: the old read-then-write pattern collides — concurrent workers reserve DUPLICATE values', async () => {
    const values = await runConcurrent('naive', store(), N);
    // The forced-barrier read-then-write is guaranteed to produce duplicates:
    // this documents the race the atomic primitive exists to remove.
    expect(values).toHaveLength(N);
    expect(new Set(values).size).toBeLessThan(N);
  }, 30_000);

  it('FIX: reserveNextSequence yields N DISTINCT, contiguous values under real concurrency', async () => {
    const values = await runConcurrent('atomic', store(), N);
    expect(values).toHaveLength(N);
    // No duplicate — the load-bearing guarantee.
    expect(new Set(values).size).toBe(N);
    // And the counter is a clean contiguous 1..N (no gaps, no reuse).
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: N }, (_v, i) => i + 1));
  }, 30_000);
});
