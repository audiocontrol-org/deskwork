/**
 * specs/029-govern-operability — Phase 1 / US1 (T004, RED).
 *
 * FR-003: the codex lane must emit a liveness signal DURING reasoning
 * (reasoning summaries on stderr) so the watchdog can keep a TIGHT liveness
 * window without a false `killed-no-liveness`. Two halves:
 *
 *   (a) the shipped codex lane carries the config that produces the pulse —
 *       `model_reasoning_summary=detailed`, stderr liveness, a tight window
 *       (≤60s, the value the old 300s stopgap is restored to);
 *   (b) the spawn watchdog, given a stderr-liveness lane on that tight window,
 *       does NOT kill a lane that emits stderr reasoning pulses inside the
 *       window — but DOES kill one that goes silent past it (the behavior the
 *       reasoning-summary pulses now keep on the right side of).
 *
 * Half (a) reads the real shipped config; half (b) drives the real
 * `spawnCliAgainstModel` with a fake child + fake timers (the existing
 * spawn-terminal-states harness), no fs mocking.
 */

import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CONFIG_PATH,
  parseConfig,
} from '../../src/scope-discovery/audit-barrage/config-loader.js';
import {
  spawnCliAgainstModel,
  type BarrageChild,
} from '../../src/scope-discovery/audit-barrage/spawn-cli.js';
import type {
  ModelConfig,
  ModelRunResult,
  TimeoutBasis,
} from '../../src/scope-discovery/audit-barrage/types.js';

const dir = mkdtempSync(join(tmpdir(), 'spawn-liveness-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('codex lane reasoning-summary liveness config (US1, FR-003)', () => {
  it('keeps a tight liveness window with stderr signal + reasoning summaries enabled', async () => {
    const body = await readFile(DEFAULT_CONFIG_PATH, 'utf8');
    const codex = parseConfig(body, DEFAULT_CONFIG_PATH).models.find(
      (m) => m.name === 'codex',
    );
    if (codex === undefined) throw new Error('shipped template has no codex lane');
    expect(codex.livenessSignal).toBe('stderr');
    // Tight window: the 300s stopgap (TASK-145) is REMOVED — reasoning pulses
    // arrive fast enough to keep the watchdog on a tight bound.
    expect(codex.livenessWindowSeconds).toBeLessThanOrEqual(60);
    expect(codex.argsTemplate).toContain('model_reasoning_summary');
  });
});

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  // TASK-328: a writable stdin (not null) so the `{{prompt-stdin}}` codex-shaped lanes
  // below actually exercise the stdin prompt-delivery path (spawn-cli skips it when
  // child.stdin === null) instead of silently bypassing the contract they declare.
  readonly stdin = new PassThrough();
  readonly kills: string[] = [];
  kill(signal?: NodeJS.Signals): boolean {
    this.kills.push(signal ?? 'SIGTERM');
    return true;
  }
}

function codexShapedLane(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    name: 'codex',
    binary: 'codex',
    argsTemplate: 'exec -m {{model}} {{prompt-stdin}}',
    model: 'gpt-5.5',
    readonlyEnforcement: '--sandbox read-only',
    outputMode: 'text',
    livenessSignal: 'stderr',
    livenessWindowSeconds: 60,
    timeoutFloorSeconds: 300,
    timeoutSecsPerKb: 7,
    ...overrides,
  };
}

function spawnWithFake(
  child: FakeChild,
  model: ModelConfig,
  basis: TimeoutBasis,
): Promise<ModelRunResult> {
  return spawnCliAgainstModel({
    model,
    prompt: 'audit this',
    stdoutPath: join(dir, `lv-${model.name}-out.md`),
    stderrPath: join(dir, `lv-${model.name}-err.txt`),
    eventsPath: join(dir, `lv-${model.name}.events.ndjson`),
    timeoutBasis: basis,
    spawnImpl: (): BarrageChild => child,
  });
}

describe('watchdog honors codex stderr reasoning pulses on a tight window (US1, FR-003)', () => {
  afterEach(() => vi.useRealTimers());

  it('a codex lane emitting stderr reasoning pulses inside the 60s window is NOT killed', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const promise = spawnWithFake(
      child,
      codexShapedLane({ livenessWindowSeconds: 60, timeoutSeconds: 300 }),
      { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 300 },
    );
    // Reasoning summaries arrive on stderr every 30s — inside the 60s window.
    for (let i = 0; i < 4; i += 1) {
      vi.advanceTimersByTime(30_000);
      child.stderr.write(`[reasoning] summarizing step ${i}\n`);
    }
    child.stdout.write('# codex report\n\n### C-01 — finding');
    child.emit('close', 0, null);
    const result = await promise;
    expect(result.terminalState).toBe('completed');
    expect(result.timedOut).toBe(false);
    expect(child.kills).toEqual([]);
  });

  it('a codex lane silent past the 60s window IS killed-no-liveness (real-hang signal preserved)', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const promise = spawnWithFake(
      child,
      codexShapedLane({ livenessWindowSeconds: 60, timeoutSeconds: 300 }),
      { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 300 },
    );
    // No stderr pulse ever; advance well past the window. TASK-320: use the ASYNC
    // timer advance so the assertion is robust even if the watchdog's kill path ever
    // becomes async — a synchronous `advanceTimersByTime` + sync assert would race it.
    await vi.advanceTimersByTimeAsync(90_000);
    expect(child.kills).toContain('SIGTERM');
    child.emit('close', null, 'SIGTERM');
    const result = await promise;
    expect(result.terminalState).toBe('killed-no-liveness');
    expect(result.timedOut).toBe(false);
  });

  // TASK-319/324: RUNTIME proof (not just the pure derivation fn) that a payload-scaled
  // window actually arms a WIDER watchdog at spawn time — a stdout-pulsed lane silent for
  // 400s (well past the 300s config base, the value that false-killed) is NOT killed
  // because the derived basis scales the window in lockstep with the kill-cap.
  it('a large-payload derived lane tolerates a silence longer than the config window (scaled watchdog)', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    // 80 KB derived basis: timeout ceil(13*80)=1040s, scale 1040/420 → window ceil(300*scale).
    const promise = spawnWithFake(
      child,
      codexShapedLane({
        livenessSignal: 'stdout',
        livenessWindowSeconds: 300,
        timeoutFloorSeconds: 420,
        timeoutSecsPerKb: 13,
        timeoutSeconds: undefined,
      }),
      {
        mode: 'derived',
        payloadBytes: 80 * 1024,
        floorSeconds: 420,
        secsPerKb: 13,
        effectiveTimeoutSeconds: 1040,
      },
    );
    // 400s of silence — past the 300s config base window, under the scaled ~743s window
    // AND under the 1040s kill-cap → the healthy lane must NOT be killed.
    await vi.advanceTimersByTimeAsync(400_000);
    expect(child.kills).toEqual([]);
    child.stdout.write('# report\n\n### X-01 — finding');
    child.emit('close', 0, null);
    const result = await promise;
    expect(result.terminalState).toBe('completed');
    // The recorded window reflects the EFFECTIVE (scaled) value the watchdog used.
    expect(result.livenessWindowSeconds).toBeGreaterThan(300);
  });
});
