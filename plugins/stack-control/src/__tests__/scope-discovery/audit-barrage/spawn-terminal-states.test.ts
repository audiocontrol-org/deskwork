// specs/014-audit-barrage-reliability — T025 (RED): spawn wiring integration.
//
// Every spawn settles into exactly one terminal state (FR-006), selected by
// the lane's declared capability fields (`output_mode`, `liveness_signal`) —
// never by binary name (Principle III). The four states are exercised
// end-to-end through `orchestrateBarrage` with real fixture children; the
// kill-vs-kill-vs-close interlocks are pinned with a fake child + fake timers
// (data-model.md § terminal-state transitions: first settle wins; the
// watchdog disarms when the timeout kill begins, and vice versa).

import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { orchestrateBarrage } from '../../../scope-discovery/audit-barrage/orchestrate-barrage.js';
import {
  spawnCliAgainstModel,
  type BarrageChild,
} from '../../../scope-discovery/audit-barrage/spawn-cli.js';
import type {
  ModelConfig,
  ModelRunResult,
  TimeoutBasis,
} from '../../../scope-discovery/audit-barrage/types.js';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'spawn-terminal-'));
  await writeFile(
    join(dir, 'emit.cjs'),
    'process.stdout.write("### EMIT-01 — finding body\\n");\n',
    'utf8',
  );
  await writeFile(join(dir, 'sleep.cjs'), 'setTimeout(() => {}, 30000);\n', 'utf8');
  await writeFile(
    join(dir, 'stream.cjs'),
    [
      'process.stdout.write(JSON.stringify({type:"system",subtype:"init"}) + "\\n");',
      'process.stdout.write(JSON.stringify({type:"assistant",message:"thinking"}) + "\\n");',
      'process.stdout.write(JSON.stringify({type:"result",subtype:"success",result:"# Stream report\\n\\n### S-01 — streamed finding"}) + "\\n");',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(dir, 'stream-dead.cjs'),
    [
      'process.stdout.write(JSON.stringify({type:"system",subtype:"init"}) + "\\n");',
      'setTimeout(() => {}, 30000);',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(dir, 'pulse.cjs'),
    [
      'let n = 0;',
      'const t = setInterval(() => {',
      '  process.stdout.write("pulse " + n + "\\n");',
      '  n += 1;',
      '  if (n >= 10) { clearInterval(t); }',
      '}, 250);',
    ].join('\n'),
    'utf8',
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function lane(overrides: Partial<ModelConfig>): ModelConfig {
  return {
    name: 'lane',
    binary: process.execPath,
    argsTemplate: `${join(dir, 'emit.cjs')} {{prompt}}`,
    model: 'fixture-model',
    readonlyEnforcement: 'none',
    outputMode: 'text',
    livenessSignal: 'none',
    timeoutSeconds: 30,
    ...overrides,
  };
}

describe('all four terminal states end-to-end through orchestrateBarrage (FR-006)', () => {
  let byName: Map<string, ModelRunResult>;
  let runDir: string;

  beforeAll(async () => {
    const run = await orchestrateBarrage({
      repoRoot: dir,
      featureSlug: 'terminal-states',
      prompt: 'audit this',
      models: [
        lane({ name: 'completed-lane' }),
        lane({
          name: 'timed-out-lane',
          argsTemplate: `${join(dir, 'sleep.cjs')} {{prompt}}`,
          timeoutSeconds: 1,
        }),
        lane({ name: 'spawn-failed-lane', binary: '/nonexistent-binary-stackctl-014' }),
        lane({
          name: 'killed-lane',
          argsTemplate: `${join(dir, 'sleep.cjs')} {{prompt}}`,
          livenessSignal: 'stdout',
          livenessWindowSeconds: 1,
          timeoutSeconds: 60,
        }),
        lane({
          name: 'stream-lane',
          argsTemplate: `${join(dir, 'stream.cjs')} {{prompt}}`,
          outputMode: 'stream-json',
          livenessSignal: 'stdout',
          livenessWindowSeconds: 5,
          timeoutSeconds: 30,
        }),
        lane({
          name: 'stream-dead-lane',
          argsTemplate: `${join(dir, 'stream-dead.cjs')} {{prompt}}`,
          outputMode: 'stream-json',
          livenessSignal: 'stdout',
          livenessWindowSeconds: 1,
          timeoutSeconds: 60,
        }),
        lane({
          name: 'pulse-lane',
          argsTemplate: `${join(dir, 'pulse.cjs')} {{prompt}}`,
          livenessSignal: 'stdout',
          livenessWindowSeconds: 1,
          timeoutSeconds: 30,
        }),
      ],
      runDirOverride: join(dir, 'runs'),
      tipShaResolver: async () => null,
    });
    runDir = run.runDir;
    byName = new Map(run.results.map((r) => [r.name, r]));
  }, 30000);

  it('a healthy lane settles completed with its artifact', async () => {
    const r = byName.get('completed-lane')!;
    expect(r.terminalState).toBe('completed');
    expect(r.exitCode).toBe(0);
    expect(r.reportBytes).toBeGreaterThan(0);
    const artifact = await readFile(r.stdoutPath, 'utf8');
    expect(artifact).toContain('EMIT-01');
  });

  it('a budget-exceeding lane settles timed-out', () => {
    const r = byName.get('timed-out-lane')!;
    expect(r.terminalState).toBe('timed-out');
    expect(r.timedOut).toBe(true);
  });

  it('a missing binary settles spawn-failed', () => {
    const r = byName.get('spawn-failed-lane')!;
    expect(r.terminalState).toBe('spawn-failed');
    expect(r.exitCode).toBe(-2);
    expect(r.spawnError).toBeDefined();
  });

  it('a silent lane is killed within the liveness window — killed-no-liveness, NOT timed-out (SC-004)', () => {
    const r = byName.get('killed-lane')!;
    expect(r.terminalState).toBe('killed-no-liveness');
    expect(r.timedOut).toBe(false);
    expect(r.liveness).toBe('monitored');
    expect(r.stalenessAtKillMs).toBeGreaterThan(1000);
    // The full 60s budget was never consumed.
    expect(r.durationMs).toBeLessThan(10_000);
  });

  it('a slow-but-alive pulse lane is NOT killed (SC-005)', () => {
    const r = byName.get('pulse-lane')!;
    expect(r.terminalState).toBe('completed');
  });

  it('a stream-json lane delivers the per-model markdown artifact from its result event (FR-010)', async () => {
    const r = byName.get('stream-lane')!;
    expect(r.terminalState).toBe('completed');
    expect(r.eventsPath).toBeDefined();
    expect(existsSync(r.eventsPath!)).toBe(true);
    const artifact = await readFile(r.stdoutPath, 'utf8');
    expect(artifact).toBe('# Stream report\n\n### S-01 — streamed finding');
    expect(r.reportBytes).toBe(Buffer.byteLength(artifact, 'utf8'));
  });

  it('a killed stream lane leaves the markdown artifact ABSENT (never fabricated)', () => {
    const r = byName.get('stream-dead-lane')!;
    expect(r.terminalState).toBe('killed-no-liveness');
    expect(r.reportBytes).toBe(0);
    expect(existsSync(r.stdoutPath)).toBe(false);
    // The forensic capture still exists with the events that DID arrive.
    expect(existsSync(join(runDir, 'stream-dead-lane.events.ndjson'))).toBe(true);
  });
});

describe('events-path honesty for stream lanes that never wrote a capture (AUDIT-20260611-21)', () => {
  // The events file is created lazily by the extractor on the first
  // consumed stdout line. A spawn-failed stream lane (no chunk ever
  // arrived) must NOT record an eventsPath — renderModelRow gates the
  // INDEX `- events path:` row on field presence, so an unconditional
  // eventsPath would publish a path to a file that does not exist.
  it('a stream-mode spawn failure records NO eventsPath and leaves the events file absent', async () => {
    const evPath = join(dir, 'spawn-failed-stream.events.ndjson');
    const result = await spawnCliAgainstModel({
      model: lane({
        name: 'spawn-failed-stream-lane',
        binary: '/nonexistent-binary-stackctl-014-stream',
        outputMode: 'stream-json',
      }),
      prompt: 'p',
      stdoutPath: join(dir, 'spawn-failed-stream.md'),
      stderrPath: join(dir, 'spawn-failed-stream.err.txt'),
      eventsPath: evPath,
      timeoutBasis: { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 10 },
    });
    expect(result.terminalState).toBe('spawn-failed');
    expect(result.eventsPath).toBeUndefined();
    expect(existsSync(evPath)).toBe(false);
  });
});

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = null;
  readonly kills: string[] = [];
  kill(signal?: NodeJS.Signals): boolean {
    this.kills.push(signal ?? 'SIGTERM');
    return true;
  }
}

describe('kill-vs-close interlocks (data-model state machine)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function spawnWithFake(
    child: FakeChild,
    model: ModelConfig,
    basis: TimeoutBasis,
  ): Promise<ModelRunResult> {
    const fakeSpawn = (): BarrageChild => child;
    return spawnCliAgainstModel({
      model,
      prompt: 'p',
      stdoutPath: join(dir, `race-${Math.floor(Math.random() * 1e9)}.md`),
      stderrPath: join(dir, `race-${Math.floor(Math.random() * 1e9)}.err.txt`),
      eventsPath: join(dir, `race-${Math.floor(Math.random() * 1e9)}.events.ndjson`),
      timeoutBasis: basis,
      spawnImpl: fakeSpawn,
    });
  }

  it('close before any kill settles completed', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const promise = spawnWithFake(
      child,
      lane({ livenessSignal: 'none', timeoutSeconds: 10 }),
      { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 10 },
    );
    child.stdout.write('artifact');
    vi.advanceTimersByTime(1_000);
    child.emit('close', 0, null);
    const result = await promise;
    expect(result.terminalState).toBe('completed');
    expect(child.kills).toEqual([]);
  });

  it('the timeout kill disarms the watchdog — settles timed-out, never killed-no-liveness', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const promise = spawnWithFake(
      child,
      lane({ livenessSignal: 'stdout', livenessWindowSeconds: 2, timeoutSeconds: 1 }),
      { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 1 },
    );
    vi.advanceTimersByTime(1_100); // budget elapses first
    expect(child.kills).toContain('SIGTERM');
    vi.advanceTimersByTime(3_000); // the (disarmed) watchdog window passes too
    child.emit('close', null, 'SIGTERM');
    const result = await promise;
    expect(result.terminalState).toBe('timed-out');
    expect(result.timedOut).toBe(true);
  });

  it('the watchdog kill disarms the timeout — settles killed-no-liveness even after the budget elapses', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const promise = spawnWithFake(
      child,
      lane({ livenessSignal: 'stdout', livenessWindowSeconds: 1, timeoutSeconds: 2 }),
      { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 2 },
    );
    vi.advanceTimersByTime(1_400); // window (1s) + check cadence elapse before the 2s budget
    expect(child.kills).toContain('SIGTERM');
    vi.advanceTimersByTime(3_000); // the (disarmed) budget elapses too
    child.emit('close', null, 'SIGTERM');
    const result = await promise;
    expect(result.terminalState).toBe('killed-no-liveness');
    expect(result.timedOut).toBe(false);
  });

  it('an external signal kill (no wrapper kill) settles killed-external, never completed (AUDIT-20260611-13)', async () => {
    // The 014 rewrite dropped the close handler's `signal` argument, so a
    // child terminated by a signal the wrapper did NOT send (OOM killer,
    // out-of-band SIGTERM/SIGKILL) arrived with killReason === null and
    // settled `completed` — letting its PARTIAL capture into the lift
    // (FR-007 violation). The wrapper sent no kill, yet close carries a
    // non-null signal: that is the killed-external state.
    vi.useFakeTimers();
    const child = new FakeChild();
    const promise = spawnWithFake(
      child,
      lane({ livenessSignal: 'none', timeoutSeconds: 600 }),
      { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 600 },
    );
    child.stdout.write('partial capture before the OOM kill');
    vi.advanceTimersByTime(1_000); // well inside the budget; no wrapper kill
    expect(child.kills).toEqual([]);
    child.emit('close', null, 'SIGKILL');
    const result = await promise;
    expect(result.terminalState).toBe('killed-external');
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(-1);
  });

  it('liveness_signal none NEVER arms the watchdog', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const promise = spawnWithFake(
      child,
      lane({ livenessSignal: 'none', timeoutSeconds: 600 }),
      { mode: 'override', payloadBytes: 1, effectiveTimeoutSeconds: 600 },
    );
    vi.advanceTimersByTime(300_000); // far past any window; no pulse ever
    expect(child.kills).toEqual([]);
    child.emit('close', 0, null);
    const result = await promise;
    expect(result.liveness).toBe('unmonitored');
    expect(result.terminalState).toBe('completed');
  });
});
