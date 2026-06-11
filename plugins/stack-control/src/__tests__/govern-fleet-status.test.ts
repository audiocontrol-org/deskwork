// specs/014-audit-barrage-reliability — T020 (RED): govern convergence-loop
// fleet status (FR-007, US3 scenario 3).
//
// Every govern round's status lines include the fleet report read from the
// round's run-dir INDEX, so repeated same-lane kills across rounds are
// visible in the LOOP's own output — not only in per-run artifact files. A
// round whose verdict could be "0 HIGH" over a degraded fleet is annotated
// as degraded. Pre-014 run dirs (stub barrage bins, legacy INDEX) emit no
// fleet lines (compat).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reportFleetStatus } from '../govern/protocol.js';
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

  it('a healthy round prints the fleet line without degradation noise', () => {
    const runDir = makeRunDir([laneResult({}), laneResult({ name: 'codex' })]);
    const err = collect(runDir);
    expect(err).toContain('govern: fleet — configured 2, produced 2');
    expect(err).not.toContain('DEGRADED');
    expect(err).not.toContain('quorum');
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
