// specs/014-audit-barrage-reliability — T006 (RED): spawn read-only enforcement.
//
// FR-003/FR-004: every barrage spawn is mechanically read-only via the lane's
// `readonly_enforcement` CLI fragment, injected into the assembled argv BEFORE
// the prompt placeholder — never by prompt instruction. The sentinel `none`
// lets the lane run, but the settle record carries `enforcement: 'unenforced'`
// so every downstream surface can mark it loudly.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    name: 'probe',
    binary: 'probe',
    argsTemplate: '-p {{prompt}}',
    model: 'opus',
    readonlyEnforcement: '--permission-mode plan',
    outputMode: 'text',
    livenessSignal: 'none',
    timeoutFloorSeconds: 30,
    timeoutSecsPerKb: 1,
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

describe('argv assembly injects the enforcement fragment (FR-003)', () => {
  it('splices the fragment tokens immediately before the prompt placeholder', () => {
    const args = buildArgs(lane(), 'AUDIT THIS');
    expect(args).toEqual(['-p', '--permission-mode', 'plan', 'AUDIT THIS']);
  });

  it('splices the fragment at the (stripped) stdin-placeholder position', () => {
    const args = buildArgs(
      lane({ argsTemplate: '-p --verbose {{prompt-stdin}}' }),
      'AUDIT THIS',
    );
    expect(args).toEqual(['-p', '--verbose', '--permission-mode', 'plan']);
  });

  it('does NOT duplicate a fragment the template already carries', () => {
    const args = buildArgs(
      lane({ argsTemplate: '-p --permission-mode plan {{prompt}}' }),
      'AUDIT THIS',
    );
    expect(args).toEqual(['-p', '--permission-mode', 'plan', 'AUDIT THIS']);
  });

  it('still injects before the prompt when the fragment appears only AFTER it', () => {
    // AUDIT-20260611-05: a fragment positioned after the prompt placeholder
    // does NOT count as present — CLIs that stop option parsing at the
    // prompt boundary would run unenforced while marked `enforced`. The
    // benign duplicate after the prompt is acceptable; injection before
    // the prompt is not skippable (FR-003).
    const args = buildArgs(
      lane({ argsTemplate: '-p {{prompt}} --permission-mode plan' }),
      'AUDIT THIS',
    );
    expect(args).toEqual([
      '-p',
      '--permission-mode',
      'plan',
      'AUDIT THIS',
      '--permission-mode',
      'plan',
    ]);
  });

  it('injects nothing for the sentinel `none`', () => {
    const args = buildArgs(lane({ readonlyEnforcement: 'none' }), 'AUDIT THIS');
    expect(args).toEqual(['-p', 'AUDIT THIS']);
  });

  // AUDIT-20260611-17: a whitespace-only fragment trims/splits to zero
  // tokens — buildArgs injects nothing. (The config loader refuses this
  // shape at load; this pins the argv behavior for configs constructed
  // outside the loader.)
  it('injects nothing for a whitespace-only fragment (AUDIT-20260611-17)', () => {
    const args = buildArgs(lane({ readonlyEnforcement: '   ' }), 'AUDIT THIS');
    expect(args).toEqual(['-p', 'AUDIT THIS']);
  });
});

describe('settle record carries the enforcement state (FR-004)', () => {
  let dir: string;
  let scriptPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'spawn-readonly-'));
    scriptPath = join(dir, 'emit.cjs');
    await writeFile(scriptPath, 'process.stdout.write("report body");\n', 'utf8');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function nodeLane(overrides: Partial<ModelConfig>): ModelConfig {
    return lane({
      binary: process.execPath,
      argsTemplate: `${scriptPath} {{prompt}}`,
      ...overrides,
    });
  }

  it('a fragment lane settles with enforcement: enforced', async () => {
    const result = await spawnCliAgainstModel({
      model: nodeLane({ readonlyEnforcement: '--ignored-by-fixture' }),
      prompt: 'p',
      stdoutPath: join(dir, 'enforced.md'),
      stderrPath: join(dir, 'enforced.err.txt'),
      eventsPath: join(dir, 'enforced.events.ndjson'),
      timeoutBasis: BASIS,
    });
    expect(result.enforcement).toBe('enforced');
    expect(result.terminalState).toBe('completed');
  });

  it('a `none` lane settles with enforcement: unenforced', async () => {
    const result = await spawnCliAgainstModel({
      model: nodeLane({ readonlyEnforcement: 'none' }),
      prompt: 'p',
      stdoutPath: join(dir, 'unenforced.md'),
      stderrPath: join(dir, 'unenforced.err.txt'),
      eventsPath: join(dir, 'unenforced.events.ndjson'),
      timeoutBasis: BASIS,
    });
    expect(result.enforcement).toBe('unenforced');
  });

  // AUDIT-20260611-17 defense-in-depth: a ModelConfig constructed OUTSIDE
  // the loader with a whitespace-only fragment injects ZERO tokens into
  // argv; marking that lane `enforced` would lie on every downstream
  // surface (FR-004). Enforcement is derived from whether the trimmed
  // fragment carries >= 1 token, not from the sentinel comparison alone.
  it('a whitespace-only fragment lane settles enforcement: unenforced (AUDIT-20260611-17)', async () => {
    const result = await spawnCliAgainstModel({
      model: nodeLane({ readonlyEnforcement: '   ' }),
      prompt: 'p',
      stdoutPath: join(dir, 'blank-fragment.md'),
      stderrPath: join(dir, 'blank-fragment.err.txt'),
      eventsPath: join(dir, 'blank-fragment.events.ndjson'),
      timeoutBasis: BASIS,
    });
    expect(result.enforcement).toBe('unenforced');
    expect(result.terminalState).toBe('completed');
  });
});
