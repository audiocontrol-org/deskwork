// specs/014 US1 (TASK-29 / gh-447): degraded barrage fleet is LOUD.
//
// The defect: an OUTAGE (0 covering models) already exits 1, but the
// PARTIAL case — "N of M models emitted findings" — renders as plain
// success, never naming the zero-output model or the lost cross-model
// agreement signal (the HIGH-confidence signal the protocol runs for).
// A model timing out with zero bytes is fleet degradation and must be
// announced at the moment it happens, not discovered later in run JSON.
//
// Contract under test (cli-contracts §audit-barrage; data-model
// §ModelRunResult; research R1):
//   - "degraded" = configured model with stdoutBytes === 0 (timeout or
//     not). Partial output then timeout (stdoutBytes > 0) is NOT
//     zero-output degradation and must not be misclassified.
//   - "emitting model" = stdoutBytes > 0.
//   - when emitting < 2, the consequence line states cross-model
//     agreement is unavailable.
//   - --require-models <n>: minimum emitting models; effective floor is
//     min(n, CONFIGURED fleet size) — the loaded config's battery, never
//     the --models/GOVERN_MODELS subset actually run (AUDIT-20260611-03);
//     shortfall fails loudly naming expected vs actual and each
//     non-emitting model. Default exit codes unchanged when no floor is
//     requested (FR-002/FR-014).

import { describe, it, expect } from 'vitest';
import type {
  BarrageRun,
  ModelRunResult,
} from '../scope-discovery/audit-barrage/types.js';
import {
  deriveBarrageExitCode,
  parseFlags,
  renderFleetWarnings,
  renderSummaryLine,
} from '../subcommands/audit-barrage.js';

function modelResult(overrides: Partial<ModelRunResult>): ModelRunResult {
  return {
    name: 'm',
    exitCode: 0,
    durationMs: 100,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutPath: '/tmp/m.md',
    stderrPath: '/tmp/stderr/m.txt',
    timedOut: false,
    spawnError: undefined,
    ...overrides,
  };
}

function runWith(results: ReadonlyArray<ModelRunResult>): BarrageRun {
  return {
    runDir: '/tmp/run',
    timestamp: '20260611T000000Z',
    featureSlug: 'demo',
    promptPath: '/tmp/run/PROMPT.md',
    indexPath: '/tmp/run/INDEX.md',
    results,
  };
}

// The recorded TASK-29 shape: one model emitted findings, the other
// timed out having produced zero bytes.
function partialFleetRun(): BarrageRun {
  return runWith([
    modelResult({ name: 'claude', stdoutBytes: 2048, exitCode: 0 }),
    modelResult({
      name: 'codex',
      stdoutBytes: 0,
      exitCode: -1,
      timedOut: true,
      durationMs: 600_000,
    }),
  ]);
}

describe('US1 — zero-output degradation warnings (renderFleetWarnings)', () => {
  it('partial fleet names the zero-output model with the timeout cause', () => {
    const warnings = renderFleetWarnings(partialFleetRun(), undefined);
    const zeroOutput = warnings.filter((w) => /produced no output/.test(w));
    expect(zeroOutput).toHaveLength(1);
    expect(zeroOutput[0]).toMatch(/'codex'/);
    expect(zeroOutput[0]).toMatch(/timed out/);
  });

  it('partial fleet emits the lost-agreement consequence line (emitting < 2)', () => {
    const warnings = renderFleetWarnings(partialFleetRun(), undefined);
    const consequence = warnings.filter((w) => /cross-model agreement/.test(w));
    expect(consequence).toHaveLength(1);
    expect(consequence[0]).toMatch(/only 1 model/);
    expect(consequence[0]).toMatch(/unavailable/);
  });

  it('zero-output via plain non-zero exit names the exit code, not a timeout', () => {
    const run = runWith([
      modelResult({ name: 'claude', stdoutBytes: 2048, exitCode: 0 }),
      modelResult({ name: 'gemini', stdoutBytes: 0, exitCode: 7 }),
    ]);
    const warnings = renderFleetWarnings(run, undefined);
    const zeroOutput = warnings.filter((w) => /produced no output/.test(w));
    expect(zeroOutput).toHaveLength(1);
    expect(zeroOutput[0]).toMatch(/'gemini'/);
    expect(zeroOutput[0]).toMatch(/exited 7/);
    expect(zeroOutput[0]).not.toMatch(/timed out/);
  });

  it('healthy fleet emits no degradation text at all (no cry-wolf)', () => {
    const run = runWith([
      modelResult({ name: 'claude', stdoutBytes: 1024, exitCode: 0 }),
      modelResult({ name: 'codex', stdoutBytes: 512, exitCode: 0 }),
    ]);
    expect(renderFleetWarnings(run, undefined)).toEqual([]);
  });

  it('partial-output-then-timeout (stdoutBytes > 0) is NOT reported as zero-output (research R1 edge)', () => {
    const run = runWith([
      modelResult({ name: 'claude', stdoutBytes: 1024, exitCode: 0 }),
      modelResult({
        name: 'codex',
        stdoutBytes: 256,
        exitCode: -1,
        timedOut: true,
      }),
    ]);
    const warnings = renderFleetWarnings(run, undefined);
    expect(warnings.filter((w) => /produced no output/.test(w))).toEqual([]);
    // Both models emitted (stdoutBytes > 0) — no lost-agreement line either.
    expect(warnings.filter((w) => /cross-model agreement/.test(w))).toEqual([]);
  });
});

describe('US1 — summary line names degraded models in the partial case', () => {
  it('partial summary names the zero-output model', () => {
    const line = renderSummaryLine(partialFleetRun());
    expect(line).toMatch(/codex/);
  });

  it('fully-healthy summary carries no degradation text (unchanged shape)', () => {
    const run = runWith([
      modelResult({ name: 'claude', stdoutBytes: 1024, exitCode: 0 }),
      modelResult({ name: 'codex', stdoutBytes: 512, exitCode: 0 }),
    ]);
    const line = renderSummaryLine(run);
    expect(line).toMatch(/2\/2/);
    expect(line).not.toMatch(/zero-output/);
    expect(line).not.toMatch(/no output/);
  });
});

describe('US1 — --require-models fleet floor', () => {
  it('parseFlags accepts --require-models <n>', () => {
    const parsed = parseFlags([
      '--feature',
      'demo',
      '--prompt-file',
      '/tmp/p.md',
      '--require-models',
      '2',
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.flags?.requireModels).toBe(2);
  });

  it('parseFlags leaves requireModels undefined when the flag is absent (manual default: no floor)', () => {
    const parsed = parseFlags([
      '--feature',
      'demo',
      '--prompt-file',
      '/tmp/p.md',
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.flags?.requireModels).toBeUndefined();
  });

  it('parseFlags rejects a non-positive-integer --require-models value', () => {
    for (const bad of ['0', '-1', 'two', '1.5']) {
      const parsed = parseFlags([
        '--feature',
        'demo',
        '--prompt-file',
        '/tmp/p.md',
        '--require-models',
        bad,
      ]);
      expect(parsed.ok).toBe(false);
    }
  });

  it('floor 2 with 1 emitting model fails loudly naming expected vs actual and the non-emitting model', () => {
    const run = partialFleetRun();
    expect(deriveBarrageExitCode(run, 2)).toBe(1);
    const warnings = renderFleetWarnings(run, 2);
    const shortfall = warnings.filter((w) => /require/i.test(w) && /2/.test(w));
    expect(shortfall.length).toBeGreaterThanOrEqual(1);
    const line = shortfall.join('\n');
    expect(line).toMatch(/2/); // expected
    expect(line).toMatch(/1/); // actual
    expect(line).toMatch(/codex/); // each non-emitting model named
  });

  it('without a floor, the partial-fleet exit code is unchanged (0) — FR-002/FR-014', () => {
    expect(deriveBarrageExitCode(partialFleetRun())).toBe(0);
    expect(deriveBarrageExitCode(partialFleetRun(), undefined)).toBe(0);
  });

  it('floor clamps to configured fleet size: 1-model fleet + floor 2 names the configured-fleet shortfall and passes when the model emits', () => {
    const run = runWith([
      modelResult({ name: 'solo', stdoutBytes: 64, exitCode: 0 }),
    ]);
    // Effective floor = min(2, 1) = 1; the solo model emits → satisfied.
    expect(deriveBarrageExitCode(run, 2)).toBe(0);
    const warnings = renderFleetWarnings(run, 2);
    const clampNote = warnings.filter((w) => /fleet size/.test(w));
    expect(clampNote).toHaveLength(1);
    expect(clampNote[0]).toMatch(/2/); // requested floor
    expect(clampNote[0]).toMatch(/1/); // configured fleet size
  });

  it('floor failure on a clamped 1-model fleet still fails loud when the model emits nothing', () => {
    const run = runWith([
      modelResult({ name: 'solo', stdoutBytes: 0, exitCode: -1, timedOut: true }),
    ]);
    expect(deriveBarrageExitCode(run, 2)).toBe(1);
  });
});

// AUDIT-20260611-03: the floor clamps against the CONFIGURED fleet size,
// not the --models/GOVERN_MODELS subset actually run. A 2-model config
// narrowed to one model via --models must NOT lower govern's floor 2 to
// 1 — that would make the cross-model agreement floor opt-out-able via
// an env var with no exit-code consequence.
describe('US1 — fleet floor counts the CONFIGURED fleet, not the --models subset (AUDIT-20260611-03)', () => {
  // Simulates: 2-model config, `--models claude` subset, the selected
  // model emits cleanly. Only ONE result is in the run.
  function subsetRun(): BarrageRun {
    return runWith([
      modelResult({ name: 'claude', stdoutBytes: 2048, exitCode: 0 }),
    ]);
  }

  it('subset of a 2-model config does NOT clamp floor 2: exit 1 despite the selected model emitting', () => {
    // configuredFleetSize = 2 → effective floor stays 2; only 1 result
    // can emit → FLOOR SHORTFALL.
    expect(deriveBarrageExitCode(subsetRun(), 2, 2)).toBe(1);
  });

  it('subset shortfall line names the effective floor of 2 (not a clamped 1)', () => {
    const warnings = renderFleetWarnings(subsetRun(), 2, 2);
    const shortfall = warnings.filter((w) => /FLOOR SHORTFALL/.test(w));
    expect(shortfall).toHaveLength(1);
    expect(shortfall[0]).toMatch(/required 2/);
    // No clamp NOTE — the requested floor does not exceed the
    // configured fleet size.
    expect(warnings.filter((w) => /NOTE/.test(w))).toEqual([]);
  });

  it('subset shortfall names SELECTION as the cause when selected < effective floor', () => {
    const warnings = renderFleetWarnings(subsetRun(), 2, 2);
    const selection = warnings.filter((w) => /selected/.test(w));
    expect(selection.length).toBeGreaterThanOrEqual(1);
    const line = selection.join('\n');
    expect(line).toMatch(/1/); // selected count
    expect(line).toMatch(/2/); // configured fleet size
    expect(line).toMatch(/configured/);
  });

  it('genuine 1-model CONFIG still clamps: emitting solo model passes with floor 2', () => {
    const run = runWith([
      modelResult({ name: 'solo', stdoutBytes: 64, exitCode: 0 }),
    ]);
    expect(deriveBarrageExitCode(run, 2, 1)).toBe(0);
  });

  it('clamp NOTE truthfully names the CONFIGURED fleet size (1), not the subset', () => {
    const run = runWith([
      modelResult({ name: 'solo', stdoutBytes: 64, exitCode: 0 }),
    ]);
    const warnings = renderFleetWarnings(run, 2, 1);
    const clampNote = warnings.filter((w) => /NOTE/.test(w));
    expect(clampNote).toHaveLength(1);
    expect(clampNote[0]).toMatch(/configured fleet size 1/);
    expect(clampNote[0]).toMatch(/effective floor is 1/);
  });

  it('back-compat: omitting configuredFleetSize falls back to run.results.length (library callers without subset selection)', () => {
    const run = runWith([
      modelResult({ name: 'solo', stdoutBytes: 64, exitCode: 0 }),
    ]);
    // Without the third arg the fleet size derives from the run — equal
    // to the configured size when no subset was selected.
    expect(deriveBarrageExitCode(run, 2)).toBe(0);
  });
});
