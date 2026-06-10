// AUDIT-20260607-42: liftability vs coverage split.
//
// `isModelRunHealthy` (liftability) governs ONLY what the lift extracts:
// did the model produce output worth lifting? = stdoutBytes>0 && no spawn
// failure. We NEVER discard liftable output.
//
// `isModelRunCovering` (coverage, NEW + stricter) governs the FR-008
// healthy-coverage count, the FR-005 zero-coverage OUTAGE determination,
// the clean-run claim, the summary line, and the tip.sha gate:
// liftability AND exitCode === 0 (ran to completion). exitCode===0 also
// excludes timeout (-1) and spawn failure (-2).
//
// The hole this closes (FR-005/US3/SC-003): a family that prints a banner
// then dies `exit 1` satisfies liftability and, under the OLD predicate,
// was counted a HEALTHY covering family contributing a "clean" 0 findings.
// In the single-family floor that is indistinguishable from a legit clean
// run — an outage masquerades as governed-clean.

import { describe, it, expect } from 'vitest';
import {
  isModelRunHealthy,
  isModelRunCovering,
  type ModelRunResult,
} from '../scope-discovery/audit-barrage/types.js';
import {
  deriveBarrageExitCode,
  renderSummaryLine,
} from '../subcommands/audit-barrage.js';
import type { BarrageRun } from '../scope-discovery/audit-barrage/types.js';

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
    timestamp: '20260607T000000Z',
    featureSlug: 'demo',
    promptPath: '/tmp/run/PROMPT.md',
    indexPath: '/tmp/run/INDEX.md',
    results,
  };
}

describe('liftability vs coverage predicates (AUDIT-20260607-42)', () => {
  it('non-zero exit WITH bytes is liftable but NOT covering (the crash-after-banner hole)', () => {
    const r = modelResult({ stdoutBytes: 512, exitCode: 1, spawnError: undefined });
    expect(isModelRunHealthy(r)).toBe(true);
    expect(isModelRunCovering(r)).toBe(false);
  });

  it('exit 0 with bytes is BOTH liftable and covering', () => {
    const r = modelResult({ stdoutBytes: 512, exitCode: 0 });
    expect(isModelRunHealthy(r)).toBe(true);
    expect(isModelRunCovering(r)).toBe(true);
  });

  it('spawn failure (exitCode -2, spawnError set, zero bytes) is NEITHER', () => {
    const r = modelResult({
      stdoutBytes: 0,
      exitCode: -2,
      spawnError: 'ENOENT: binary not found',
    });
    expect(isModelRunHealthy(r)).toBe(false);
    expect(isModelRunCovering(r)).toBe(false);
  });

  it('timeout (exitCode -1) WITH bytes is liftable but NOT covering', () => {
    const r = modelResult({ stdoutBytes: 256, exitCode: -1, timedOut: true });
    expect(isModelRunHealthy(r)).toBe(true);
    expect(isModelRunCovering(r)).toBe(false);
  });

  it('zero bytes, exit 0 (banner-less clean exit, nothing emitted) is NEITHER', () => {
    const r = modelResult({ stdoutBytes: 0, exitCode: 0 });
    expect(isModelRunHealthy(r)).toBe(false);
    expect(isModelRunCovering(r)).toBe(false);
  });
});

describe('deriveBarrageExitCode coverage-gated (AUDIT-20260607-42)', () => {
  it('returns 1 (OUTAGE) when ALL families are non-zero-exit-with-bytes', () => {
    const run = runWith([
      modelResult({ name: 'a', stdoutBytes: 100, exitCode: 1 }),
      modelResult({ name: 'b', stdoutBytes: 200, exitCode: 137 }),
    ]);
    expect(deriveBarrageExitCode(run)).toBe(1);
  });

  it('returns 0 when ≥1 covering family exists even if others non-zero-exit', () => {
    const run = runWith([
      modelResult({ name: 'a', stdoutBytes: 100, exitCode: 0 }),
      modelResult({ name: 'b', stdoutBytes: 200, exitCode: 1 }),
    ]);
    expect(deriveBarrageExitCode(run)).toBe(0);
  });

  it('returns 1 (OUTAGE) for a single non-zero-exit family (the floor case)', () => {
    const run = runWith([modelResult({ name: 'solo', stdoutBytes: 64, exitCode: 1 })]);
    expect(deriveBarrageExitCode(run)).toBe(1);
  });

  it('returns 0 for a single exit-0 family with bytes', () => {
    const run = runWith([modelResult({ name: 'solo', stdoutBytes: 64, exitCode: 0 })]);
    expect(deriveBarrageExitCode(run)).toBe(0);
  });
});

describe('renderSummaryLine coverage-gated (AUDIT-20260607-42)', () => {
  it('reports OUTAGE (0 covering) for an all-non-zero-exit run', () => {
    const run = runWith([
      modelResult({ name: 'a', stdoutBytes: 100, exitCode: 1 }),
      modelResult({ name: 'b', stdoutBytes: 200, exitCode: 2 }),
    ]);
    const line = renderSummaryLine(run);
    expect(line).toMatch(/OUTAGE/);
    expect(line).toMatch(/0\/2/);
  });

  it('reports the COVERING count (not total) for a mixed run', () => {
    const run = runWith([
      modelResult({ name: 'a', stdoutBytes: 100, exitCode: 0 }),
      modelResult({ name: 'b', stdoutBytes: 200, exitCode: 1 }),
      modelResult({ name: 'c', stdoutBytes: 300, exitCode: 0 }),
    ]);
    const line = renderSummaryLine(run);
    expect(line).not.toMatch(/OUTAGE/);
    // 2 of 3 cover; the non-zero-exit family is lifted but not covering.
    expect(line).toMatch(/2 of 3/);
  });

  it('reports all-covering when every family exits 0 with bytes', () => {
    const run = runWith([
      modelResult({ name: 'a', stdoutBytes: 100, exitCode: 0 }),
      modelResult({ name: 'b', stdoutBytes: 200, exitCode: 0 }),
    ]);
    const line = renderSummaryLine(run);
    expect(line).not.toMatch(/OUTAGE/);
    expect(line).toMatch(/2\/2/);
  });
});
