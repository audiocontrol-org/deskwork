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
//     min(n, configured fleet size); shortfall fails loudly naming
//     expected vs actual and each non-emitting model. Default exit
//     codes unchanged when no floor is requested (FR-002/FR-014).

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
