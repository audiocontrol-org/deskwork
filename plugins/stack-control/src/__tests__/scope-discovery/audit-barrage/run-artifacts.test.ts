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
  parseIndexLaneStates,
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

  it('annotates a completed-but-non-converged lane on its fleet-report line (AUDIT-20260611-11)', () => {
    // One vocabulary everywhere (FR-007): the same annotation the lift's
    // per-lane status carries (AUDIT-20260611-09) renders on the fleet
    // report's per-lane lines, so INDEX.md / fire-time stderr / lift /
    // govern all connect "completed" to the exclusion from `produced`.
    const results = [
      modelResult({}),
      modelResult({ name: 'codex', exitCode: 1, reportBytes: 28, stdoutBytes: 28 }),
    ];
    const text = renderFleetReportLines(computeFleetReport(results)).join('\n');
    expect(text).toContain('- configured: 2, produced: 1  ⚠ DEGRADED');
    expect(text).toContain(
      '- codex: completed [enforced, monitored] — completed but non-converged (exit 1, report bytes 28); not counted as produced',
    );
    // The converged lane keeps its bare line shape.
    expect(text).toContain('- claude: completed [enforced, monitored]');
    expect(text).not.toMatch(/claude: completed \[enforced, monitored\] — completed but non-converged/);
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

describe('parseIndexLaneStates mixed-INDEX fail-loud (AUDIT-20260611-07)', () => {
  it('round-trips a fully-v2 INDEX (every lane parses)', () => {
    const body = renderIndexBody(
      runWith([modelResult({}), modelResult({ name: 'codex', reportBytes: 77, stdoutBytes: 77 })]),
    );
    const lanes = parseIndexLaneStates(body);
    expect(lanes).not.toBeNull();
    expect(lanes!.map((l) => l.name)).toEqual(['claude', 'codex']);
    expect(lanes![1]!.reportBytes).toBe(77);
  });

  it('throws naming the lane + the missing field when one lane lost its report-bytes row', () => {
    // Writer drift / hand-edit simulation: render the REAL v2 body, then
    // strip exactly codex's `- report bytes:` row (unique value 77).
    const body = renderIndexBody(
      runWith([modelResult({}), modelResult({ name: 'codex', reportBytes: 77, stdoutBytes: 77 })]),
    );
    const corrupted = body
      .split('\n')
      .filter((line) => line !== '- report bytes: 77')
      .join('\n');
    expect(() => parseIndexLaneStates(corrupted)).toThrow(/codex/);
    expect(() => parseIndexLaneStates(corrupted)).toThrow(/report bytes/);
    expect(() => parseIndexLaneStates(corrupted)).toThrow(/AUDIT-20260611-07/);
  });

  it('throws when one lane is full-v2 and another lane carries ZERO v2 rows', () => {
    // Lane B exists in the manifest but cannot be parsed — that is a mixed
    // INDEX, not a pre-014 one; returning only lane A would lower
    // `configured` and mask the degradation.
    const body =
      renderIndexBody(runWith([modelResult({})])) +
      '\n### codex\n\n- exit code: 0\n- duration: 5 ms\n';
    expect(() => parseIndexLaneStates(body)).toThrow(/codex/);
    expect(() => parseIndexLaneStates(body)).toThrow(/AUDIT-20260611-07/);
  });

  it('still returns null for a genuinely pre-014 INDEX (no v2 rows on ANY lane)', () => {
    const legacy = [
      '# Audit-barrage run',
      '',
      '### claude',
      '',
      '- exit code: 0',
      '- duration: 5 ms',
      '',
      '### codex',
      '',
      '- exit code: 1',
      '- duration: 9 ms',
      '',
    ].join('\n');
    expect(parseIndexLaneStates(legacy)).toBeNull();
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
