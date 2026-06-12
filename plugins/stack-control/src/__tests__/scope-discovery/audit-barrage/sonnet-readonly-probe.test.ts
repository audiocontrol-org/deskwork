// specs/015-audit-protocol-convergence — T027 (RED): sonnet read-only probe
// (SC-007 / FR-011). The 014 mechanical read-only enforcement (buildArgs injects
// the lane's `readonly_enforcement` fragment into argv before the prompt) makes
// the 014 sonnet read-only-violation incident mechanically impossible.
//
// This is the 014 SC-002 pattern made falsifiable WITHOUT a real model CLI: a
// cooperative "hostile" fixture model mutates the repo ONLY when it is NOT
// launched with `--permission-mode plan`. Spawned through the sonnet lane (which
// carries the fragment) it sees plan-mode and writes nothing — zero new files,
// zero commits, zero pushes. The `none`-lane control proves the probe is real:
// without the fragment the same fixture DOES mutate, so a regression that dropped
// the enforcement would fail this test.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildArgs, spawnCliAgainstModel } from '../../../scope-discovery/audit-barrage/spawn-cli.js';
import type { ModelConfig, TimeoutBasis } from '../../../scope-discovery/audit-barrage/types.js';

// The sonnet OVERRIDE-PROFILE lane shape (FR-011 / D8): claude-shaped by config
// (stream-json + plan-mode), not by binary identity (Principle III).
function sonnetLane(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    name: 'sonnet',
    binary: process.execPath, // node stands in for the claude CLI in the probe
    argsTemplate: `${SCRIPT} {{prompt}}`,
    model: 'claude-sonnet-4-6',
    readonlyEnforcement: '--permission-mode plan',
    outputMode: 'stream-json',
    livenessSignal: 'stdout',
    livenessWindowSeconds: 60,
    timeoutFloorSeconds: 30,
    timeoutSecsPerKb: 13,
    ...overrides,
  };
}

const BASIS: TimeoutBasis = {
  mode: 'derived',
  payloadBytes: 5,
  floorSeconds: 30,
  secsPerKb: 1,
  effectiveTimeoutSeconds: 30,
};

let dir: string;
let SCRIPT = '';
let hostileTarget = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sonnet-probe-'));
  hostileTarget = join(dir, 'HOSTILE-MUTATION');
  // The spawned child inherits process.env (defaultSpawn passes no env override),
  // so the fixture reads HOSTILE_TARGET from here.
  process.env.HOSTILE_TARGET = hostileTarget;
  SCRIPT = join(dir, 'hostile-model.cjs');
  // A cooperative model: it mutates the repo (writes HOSTILE_TARGET) ONLY when it
  // is NOT launched in plan-mode. A claude CLI honoring --permission-mode plan
  // behaves exactly this way — plan-mode forbids the write. The probe thus tests
  // that the enforcement fragment REACHES the model, end-to-end.
  writeFileSync(
    SCRIPT,
    [
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'const planMode = argv.includes("--permission-mode") && argv.includes("plan");',
      'if (!planMode) { fs.writeFileSync(process.env.HOSTILE_TARGET, "mutated"); }',
      'process.stdout.write("report body");',
      '',
    ].join('\n'),
    'utf8',
  );
});

afterEach(() => {
  delete process.env.HOSTILE_TARGET;
  rmSync(dir, { recursive: true, force: true });
});

describe('sonnet spawn is mechanically read-only (SC-007 / FR-011)', () => {
  it('the sonnet lane argv carries --permission-mode plan before the prompt', () => {
    const args = buildArgs(sonnetLane({ argsTemplate: '-p {{prompt}}' }), 'AUDIT THIS');
    expect(args).toEqual(['-p', '--permission-mode', 'plan', 'AUDIT THIS']);
  });

  it('spawned under plan-mode, the hostile model produces ZERO new files (zero mutations)', async () => {
    const result = await spawnCliAgainstModel({
      model: sonnetLane(),
      prompt: 'p',
      stdoutPath: join(dir, 'sonnet.md'),
      stderrPath: join(dir, 'sonnet.err.txt'),
      eventsPath: join(dir, 'sonnet.events.ndjson'),
      timeoutBasis: BASIS,
    });
    expect(result.terminalState).toBe('completed');
    expect(result.enforcement).toBe('enforced');
    expect(existsSync(hostileTarget)).toBe(false); // sonnet could not mutate the repo
  });

  it('control: WITHOUT the fragment (none lane) the same fixture DOES mutate (probe is real)', async () => {
    await spawnCliAgainstModel({
      model: sonnetLane({ readonlyEnforcement: 'none' }),
      prompt: 'p',
      stdoutPath: join(dir, 'none.md'),
      stderrPath: join(dir, 'none.err.txt'),
      eventsPath: join(dir, 'none.events.ndjson'),
      timeoutBasis: BASIS,
    });
    // The probe is falsifiable: drop the enforcement and the mutation lands.
    expect(existsSync(hostileTarget)).toBe(true);
  });
});
