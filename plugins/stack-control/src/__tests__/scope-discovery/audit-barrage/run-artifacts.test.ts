// specs/014-audit-barrage-reliability — T016 (RED): INDEX.md terminal-state
// surfacing + fleet report (FR-002/FR-006/FR-007,
// contracts/run-artifacts-contract.md). Includes the T008 fire-time
// unenforced warning and the T014 `timeout basis` row.
//
// The INDEX is the run's durable manifest: every per-model row carries the
// terminal state / enforcement / liveness / timeout-basis vocabulary, and a
// degraded run (produced < configured) renders the fleet report block so an
// operator reading ONLY the artifacts can answer "did every configured model
// actually report?" (SC-003).

import { describe, expect, it } from 'vitest';
import {
  renderFleetReportLines,
  renderIndexBody,
} from '../../../scope-discovery/audit-barrage/run-artifacts.js';
import { renderUnenforcedWarning } from '../../../subcommands/audit-barrage.js';
import {
  computeFleetReport,
  type BarrageRun,
  type ModelConfig,
  type ModelRunResult,
} from '../../../scope-discovery/audit-barrage/types.js';

function modelResult(overrides: Partial<ModelRunResult>): ModelRunResult {
  return {
    name: 'claude',
    exitCode: 0,
    durationMs: 1000,
    stdoutBytes: 512,
    stderrBytes: 0,
    reportBytes: 512,
    stdoutPath: '/runs/x/claude.md',
    stderrPath: '/runs/x/stderr/claude.txt',
    timedOut: false,
    terminalState: 'completed',
    enforcement: 'enforced',
    liveness: 'monitored',
    livenessWindowSeconds: 60,
    timeoutBasis: {
      mode: 'derived',
      payloadBytes: 69000,
      floorSeconds: 300,
      secsPerKb: 13,
      effectiveTimeoutSeconds: 876,
    },
    ...overrides,
  };
}

function runWith(results: ReadonlyArray<ModelRunResult>): BarrageRun {
  return {
    runDir: '/runs/x',
    timestamp: '20260611T000000000Z',
    featureSlug: 'demo',
    promptPath: '/runs/x/PROMPT.md',
    indexPath: '/runs/x/INDEX.md',
    results,
  };
}

describe('INDEX per-model rows (T016 / contracts/run-artifacts-contract.md)', () => {
  it('renders terminal state, enforcement, monitored liveness with window, and the derived timeout basis', () => {
    const body = renderIndexBody(runWith([modelResult({})]));
    expect(body).toContain('- terminal state: completed');
    expect(body).toContain('- enforcement: enforced');
    expect(body).toContain('- liveness: monitored (window 60s)');
    expect(body).toContain(
      '- timeout basis: derived (payload 69000 bytes × 13 s/KB, floor 300) → 876 s',
    );
  });

  it('renders an override basis as override → T s', () => {
    const body = renderIndexBody(
      runWith([
        modelResult({
          timeoutBasis: { mode: 'override', payloadBytes: 100, effectiveTimeoutSeconds: 900 },
        }),
      ]),
    );
    expect(body).toContain('- timeout basis: override → 900 s');
  });

  it('renders unmonitored liveness and unenforced state', () => {
    const body = renderIndexBody(
      runWith([
        modelResult({
          enforcement: 'unenforced',
          liveness: 'unmonitored',
          livenessWindowSeconds: undefined,
        }),
      ]),
    );
    expect(body).toContain('- enforcement: unenforced');
    expect(body).toContain('- liveness: unmonitored');
  });

  it('renders staleness at kill on a liveness-killed lane', () => {
    const body = renderIndexBody(
      runWith([
        modelResult({
          terminalState: 'killed-no-liveness',
          exitCode: -1,
          stalenessAtKillMs: 61500,
        }),
      ]),
    );
    expect(body).toContain('- terminal state: killed-no-liveness');
    expect(body).toContain('- staleness at kill: 61.5 s');
  });

  it('counts only completed lanes as attempts (FR-007 dampener accounting)', () => {
    const body = renderIndexBody(
      runWith([
        modelResult({}),
        modelResult({ name: 'codex', terminalState: 'timed-out', exitCode: -1, timedOut: true }),
      ]),
    );
    expect(body).toContain('- models configured: 2');
    expect(body).toContain('- models completed: 1');
  });
});

describe('INDEX fleet report block (T017 / FR-007)', () => {
  it('renders the degradation block when produced < configured', () => {
    const results = [
      modelResult({}),
      modelResult({
        name: 'codex',
        terminalState: 'timed-out',
        exitCode: -1,
        timedOut: true,
        reportBytes: 0,
      }),
    ];
    const body = renderIndexBody(runWith(results));
    expect(body).toContain('## Fleet report');
    expect(body).toContain('- configured: 2, produced: 1  ⚠ DEGRADED');
    expect(body).toContain('- codex: timed-out [enforced, monitored]');
    expect(body).toContain('- quorum: cross-model agreement impossible (produced ≤ 1)');
  });

  it('omits the block when every configured lane converged', () => {
    const body = renderIndexBody(
      runWith([modelResult({}), modelResult({ name: 'codex' })]),
    );
    expect(body).not.toContain('## Fleet report');
    expect(body).not.toContain('DEGRADED');
  });

  it('omits the quorum line when ≥2 lanes produced', () => {
    const results = [
      modelResult({}),
      modelResult({ name: 'codex' }),
      modelResult({
        name: 'gemini',
        terminalState: 'spawn-failed',
        exitCode: -2,
        spawnError: 'ENOENT',
        reportBytes: 0,
        stdoutBytes: 0,
      }),
    ];
    const lines = renderFleetReportLines(computeFleetReport(results));
    const text = lines.join('\n');
    expect(text).toContain('- configured: 3, produced: 2  ⚠ DEGRADED');
    expect(text).not.toContain('quorum');
  });
});

describe('fire-time unenforced warning (T008 / FR-004)', () => {
  it('names the lane and the sentinel loudly', () => {
    const lane: ModelConfig = {
      name: 'gemini',
      binary: 'gemini',
      argsTemplate: '--model {{model}} {{prompt-stdin}}',
      model: 'gemini-2.5-pro',
      readonlyEnforcement: 'none',
      outputMode: 'text',
      livenessSignal: 'none',
      timeoutSeconds: 300,
    };
    const warning = renderUnenforcedWarning(lane);
    expect(warning).toContain('gemini');
    expect(warning).toMatch(/UNENFORCED/);
    expect(warning).toContain('readonly_enforcement: none');
  });
});
