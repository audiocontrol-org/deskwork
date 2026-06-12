// specs/014-audit-barrage-reliability — T013 (RED): model pin + derived-timeout
// wiring (FR-001/FR-002).
//
// The `{{model}}` placeholder substitutes the lane's explicit pin into argv
// (no spawn floats on the ambient default); the orchestrator threads the
// rendered prompt's byte size into timeout derivation and arms the spawn with
// the basis' effective timeout, recording the basis on the settle record.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orchestrateBarrage } from '../../../scope-discovery/audit-barrage/orchestrate-barrage.js';
import {
  buildArgs,
  spawnCliAgainstModel,
} from '../../../scope-discovery/audit-barrage/spawn-cli.js';
import type {
  ModelConfig,
  TimeoutBasis,
} from '../../../scope-discovery/audit-barrage/types.js';

function lane(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    name: 'pinned',
    binary: 'pinned',
    argsTemplate: '--model {{model}} -p {{prompt}}',
    model: 'opus',
    readonlyEnforcement: 'none',
    outputMode: 'text',
    livenessSignal: 'none',
    timeoutFloorSeconds: 300,
    timeoutSecsPerKb: 13,
    ...overrides,
  };
}

describe('{{model}} substitution (FR-001)', () => {
  it('substitutes the pin as its own argv token', () => {
    const args = buildArgs(lane(), 'PROMPT');
    expect(args).toEqual(['--model', 'opus', '-p', 'PROMPT']);
  });

  it('substitutes the pin inside an embedded token', () => {
    const args = buildArgs(lane({ argsTemplate: '--model={{model}} -p {{prompt}}', model: 'o4' }), 'P');
    expect(args).toEqual(['--model=o4', '-p', 'P']);
  });
});

describe('payload threading + timeout arming (FR-002)', () => {
  let dir: string;
  let emitScript: string;
  let sleepScript: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'spawn-model-pin-'));
    emitScript = join(dir, 'emit.cjs');
    await writeFile(emitScript, 'process.stdout.write("findings");\n', 'utf8');
    sleepScript = join(dir, 'sleep.cjs');
    await writeFile(sleepScript, 'setTimeout(() => {}, 30000);\n', 'utf8');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('the orchestrator derives the basis from the rendered prompt bytes and records it on the result', async () => {
    const prompt = 'x'.repeat(2048); // 2 KB exactly → 13 × 2 = 26 → floor 300 wins
    const run = await orchestrateBarrage({
      repoRoot: dir,
      featureSlug: 'pin-thread',
      prompt,
      models: [
        lane({
          name: 'emitter',
          binary: process.execPath,
          argsTemplate: `${emitScript} --model {{model}} {{prompt}}`,
        }),
      ],
      runDirOverride: join(dir, 'runs'),
      tipShaResolver: async () => null,
    });
    const result = run.results[0]!;
    expect(result.timeoutBasis).toEqual({
      mode: 'derived',
      payloadBytes: Buffer.byteLength(prompt, 'utf8'),
      floorSeconds: 300,
      secsPerKb: 13,
      effectiveTimeoutSeconds: 300,
    });
    expect(result.terminalState).toBe('completed');
    const captured = await readFile(result.stdoutPath, 'utf8');
    expect(captured).toBe('findings');
  });

  it('the spawn arms the EFFECTIVE timeout from the basis (a child outliving it is timed-out)', async () => {
    const basis: TimeoutBasis = {
      mode: 'override',
      payloadBytes: 1,
      effectiveTimeoutSeconds: 1,
    };
    const result = await spawnCliAgainstModel({
      model: lane({
        name: 'sleeper',
        binary: process.execPath,
        argsTemplate: `${sleepScript} {{prompt}}`,
        timeoutSeconds: 1,
      }),
      prompt: 'p',
      stdoutPath: join(dir, 'sleeper.md'),
      stderrPath: join(dir, 'sleeper.err.txt'),
      eventsPath: join(dir, 'sleeper.events.ndjson'),
      timeoutBasis: basis,
    });
    expect(result.timedOut).toBe(true);
    expect(result.terminalState).toBe('timed-out');
    expect(result.timeoutBasis.mode).toBe('override');
  }, 15000);

  it('an explicit override lane records mode: override end-to-end through the orchestrator', async () => {
    const run = await orchestrateBarrage({
      repoRoot: dir,
      featureSlug: 'pin-override',
      prompt: 'short',
      models: [
        lane({
          name: 'emitter',
          binary: process.execPath,
          argsTemplate: `${emitScript} {{prompt}}`,
          timeoutSeconds: 120,
        }),
      ],
      runDirOverride: join(dir, 'runs-override'),
      tipShaResolver: async () => null,
    });
    expect(run.results[0]!.timeoutBasis.mode).toBe('override');
    expect(run.results[0]!.timeoutBasis.effectiveTimeoutSeconds).toBe(120);
  });
});
