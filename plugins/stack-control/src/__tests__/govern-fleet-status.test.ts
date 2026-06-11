// specs/014-audit-barrage-reliability — T020 (RED): govern convergence-loop
// fleet status (FR-007, US3 scenario 3).
//
// Every govern round's status lines include the fleet report read from the
// round's run-dir INDEX, so repeated same-lane kills across rounds are
// visible in the LOOP's own output — not only in per-run artifact files. A
// round whose verdict could be "0 HIGH" over a degraded fleet is annotated
// as degraded. Pre-014 run dirs (stub barrage bins, legacy INDEX) emit no
// fleet lines (compat).

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GovernProtocolError, reportFleetStatus } from '../govern/protocol.js';
import {
  renderIndexBody,
  safeModelName,
} from '../scope-discovery/audit-barrage/run-artifacts.js';
import type {
  BarrageRun,
  ModelRunResult,
} from '../scope-discovery/audit-barrage/types.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function laneResult(overrides: Partial<ModelRunResult>): ModelRunResult {
  return {
    name: 'claude',
    exitCode: 0,
    durationMs: 1000,
    stdoutBytes: 100,
    stderrBytes: 0,
    reportBytes: 100,
    stdoutPath: '/x/claude.md',
    stderrPath: '/x/stderr/claude.txt',
    timedOut: false,
    terminalState: 'completed',
    enforcement: 'enforced',
    liveness: 'monitored',
    livenessWindowSeconds: 60,
    timeoutBasis: { mode: 'override', payloadBytes: 10, effectiveTimeoutSeconds: 300 },
    ...overrides,
  };
}

function makeRunDir(results: ReadonlyArray<ModelRunResult>): string {
  const runDir = mkdtempSync(join(tmpdir(), 'govern-fleet-'));
  dirs.push(runDir);
  for (const r of results) {
    if (r.reportBytes > 0) {
      writeFileSync(join(runDir, `${safeModelName(r.name)}.md`), 'report\n', 'utf8');
    }
  }
  const run: BarrageRun = {
    runDir,
    timestamp: '20260611T000000000Z',
    featureSlug: 'demo',
    promptPath: join(runDir, 'PROMPT.md'),
    indexPath: join(runDir, 'INDEX.md'),
    results,
  };
  writeFileSync(join(runDir, 'INDEX.md'), renderIndexBody(run), 'utf8');
  return runDir;
}

function collect(runDir: string): string {
  let err = '';
  reportFleetStatus(runDir, (s) => {
    err += s;
  });
  return err;
}

describe('govern round status includes the fleet report (T020 / FR-007)', () => {
  it('a degraded round prints fleet lines, per-lane states, quorum, and the 0-HIGH annotation', () => {
    const runDir = makeRunDir([
      laneResult({}),
      laneResult({
        name: 'codex',
        terminalState: 'killed-no-liveness',
        exitCode: -1,
        reportBytes: 0,
        stalenessAtKillMs: 61000,
      }),
    ]);
    const err = collect(runDir);
    expect(err).toContain('govern: fleet — configured 2, produced 1  ⚠ DEGRADED');
    expect(err).toContain('codex: killed-no-liveness [enforced, monitored]');
    expect(err).toContain('quorum — cross-model agreement impossible');
    expect(err).toMatch(/0-HIGH.*DEGRADED fleet/);
  });

  it('a completed-but-non-converged lane (CLI-rejected pin, exit 1) carries the annotation on its govern line (AUDIT-20260611-11)', () => {
    // The rejected-pin lane settles `completed` with a nonzero exit — the
    // fleet excludes it from `produced`, so the govern per-lane line must say
    // why, not print a bare "completed" next to "⚠ DEGRADED" (the same gap
    // AUDIT-20260611-09 closed on the lift surface).
    const runDir = makeRunDir([
      laneResult({}),
      laneResult({ name: 'codex', exitCode: 1, reportBytes: 28, stdoutBytes: 28 }),
    ]);
    const err = collect(runDir);
    expect(err).toContain('govern: fleet — configured 2, produced 1  ⚠ DEGRADED');
    expect(err).toContain(
      'govern:   codex: completed [enforced, monitored] — completed but non-converged (exit 1, report bytes 28); not counted as produced',
    );
    // The converged lane keeps its bare line shape.
    expect(err).toContain('govern:   claude: completed [enforced, monitored]\n');
    expect(err).not.toMatch(/claude: completed \[enforced, monitored\] — completed but non-converged/);
  });

  it('an empty completed text lane (exit 0, report bytes 0) reads DEGRADED even though <model>.md exists on disk', () => {
    // spawn-cli eagerly creates the text-lane stdout stream at spawn time, so
    // a lane that exits 0 with zero output leaves an EMPTY codex.md on disk.
    // Existence is not production: the reader must gate `produced` on the
    // INDEX `report bytes` row (writer-side isModelRunConverged semantics) or
    // the outage masquerades as a healthy fleet (AUDIT-20260611-01).
    const results = [
      laneResult({}),
      laneResult({ name: 'codex', reportBytes: 0, stdoutBytes: 0 }),
    ];
    const runDir = makeRunDir(results);
    writeFileSync(join(runDir, 'codex.md'), '', 'utf8');
    const err = collect(runDir);
    expect(err).toContain('govern: fleet — configured 2, produced 1  ⚠ DEGRADED');
    expect(err).toContain('quorum — cross-model agreement impossible');
  });

  it('a healthy round prints the fleet line without degradation noise', () => {
    const runDir = makeRunDir([laneResult({}), laneResult({ name: 'codex' })]);
    const err = collect(runDir);
    expect(err).toContain('govern: fleet — configured 2, produced 2');
    expect(err).not.toContain('DEGRADED');
    expect(err).not.toContain('quorum');
  });

  it('a mixed v2 INDEX throws a GovernProtocolError naming the lane (AUDIT-20260611-07)', () => {
    const runDir = makeRunDir([
      laneResult({}),
      laneResult({ name: 'codex', reportBytes: 77, stdoutBytes: 77 }),
    ]);
    // Writer-drift simulation: strip exactly codex's report-bytes row. The
    // degraded lane must surface as a loud protocol failure, never as a
    // silently-smaller `configured`.
    const indexPath = join(runDir, 'INDEX.md');
    const corrupted = readFileSync(indexPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '- report bytes: 77')
      .join('\n');
    writeFileSync(indexPath, corrupted, 'utf8');
    expect(() => collect(runDir)).toThrow(GovernProtocolError);
    expect(() => collect(runDir)).toThrow(/codex/);
    expect(() => collect(runDir)).toThrow(/AUDIT-20260611-07/);
  });

  it('a missing or pre-014 INDEX emits nothing (stub/legacy compat)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'govern-fleet-'));
    dirs.push(empty);
    expect(collect(empty)).toBe('');
    const legacy = mkdtempSync(join(tmpdir(), 'govern-fleet-'));
    dirs.push(legacy);
    writeFileSync(
      join(legacy, 'INDEX.md'),
      '# Audit-barrage run\n\n### claude\n\n- exit code: 0\n- duration: 5 ms\n',
      'utf8',
    );
    expect(collect(legacy)).toBe('');
  });
});
