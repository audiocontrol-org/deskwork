// specs/014-audit-barrage-reliability — T018 (RED): lift consumes terminal
// states (FR-007, contracts/run-artifacts-contract.md § Reader obligations).
//
// A lane with terminalState ≠ completed contributes ZERO findings and is
// reported with its state — never folded in as "clean / no findings". Lift
// prints each lane's enforcement state UNCONDITIONALLY (FR-004's at-synthesis
// marking always fires, not only on degradation); `produced` counts
// converged-eligible lanes only; the fleet report repeats when degraded; a
// killed lane can never make a run read "clean". Pre-014 run dirs (no v2
// INDEX) keep the old behavior.

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { runAuditBarrageLift } from '../../../subcommands/audit-barrage-lift.js';
import {
  renderIndexBody,
  safeModelName,
} from '../../../scope-discovery/audit-barrage/run-artifacts.js';
import type {
  BarrageRun,
  ModelRunResult,
} from '../../../scope-discovery/audit-barrage/types.js';

function findingBlock(model: string, nn: string, heading: string, surface: string): string {
  return [
    `### ${heading}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    'Severity:   high',
    `Surface:    ${surface}`,
    '',
    `Body for ${model}-${nn}.`,
    '',
  ].join('\n');
}

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

interface Fixture {
  readonly repo: string;
  readonly runDir: string;
}

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop()!, { recursive: true, force: true });
  }
});

/** Build a repo + run-dir; INDEX.md rendered by the REAL writer so the
 * reader is pinned against the real format, not a hand-copy. */
function makeFixture(args: {
  readonly slug: string;
  readonly modelFiles: Record<string, string>;
  readonly results?: ReadonlyArray<ModelRunResult>;
}): Fixture {
  const repo = mkdtempSync(join(tmpdir(), 'lift-terminal-'));
  fixtures.push(repo);
  const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', args.slug);
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'audit-log.md'), '# Audit Log\n', 'utf8');
  const runDir = join(repo, '.stack-control', 'audit-runs', `20260611T000000000Z-${args.slug}`);
  mkdirSync(runDir, { recursive: true });
  for (const [name, content] of Object.entries(args.modelFiles)) {
    writeFileSync(join(runDir, name), content, 'utf8');
  }
  if (args.results !== undefined) {
    const run: BarrageRun = {
      runDir,
      timestamp: '20260611T000000000Z',
      featureSlug: args.slug,
      promptPath: join(runDir, 'PROMPT.md'),
      indexPath: join(runDir, 'INDEX.md'),
      results: args.results.map((r) => ({
        ...r,
        stdoutPath: join(runDir, `${safeModelName(r.name)}.md`),
        stderrPath: join(runDir, 'stderr', `${safeModelName(r.name)}.txt`),
      })),
    };
    writeFileSync(join(runDir, 'INDEX.md'), renderIndexBody(run), 'utf8');
  }
  return { repo, runDir };
}

async function lift(fixture: Fixture, slug: string): Promise<{
  exit: number;
  out: string;
  err: string;
}> {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = '';
  let err = '';
  stdout.on('data', (c: Buffer) => {
    out += c.toString('utf8');
  });
  stderr.on('data', (c: Buffer) => {
    err += c.toString('utf8');
  });
  const exit = await runAuditBarrageLift({
    opts: {
      featureSlug: slug,
      runDir: fixture.runDir,
      date: '20260611',
      apply: false,
    },
    projectRoot: fixture.repo,
    stdout,
    stderr,
  });
  return { exit, out, err };
}

describe('non-completed lanes contribute ZERO findings (FR-007)', () => {
  it('excludes a timed-out lane’s partial capture from extraction and reports its state', async () => {
    const fixture = makeFixture({
      slug: 'deg',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Healthy lane finding', 'src/a.ts:1'),
        // The killed lane left a partial capture on disk — forensics, never findings.
        'codex.md': findingBlock('codex', '01', 'Partial capture from a killed lane', 'src/b.ts:2'),
      },
      results: [
        laneResult({ name: 'claude' }),
        laneResult({
          name: 'codex',
          terminalState: 'timed-out',
          exitCode: -1,
          timedOut: true,
          reportBytes: 0,
        }),
      ],
    });
    const { exit, out, err } = await lift(fixture, 'deg');
    expect(exit).toBe(0);
    expect(out).toContain('Healthy lane finding');
    expect(out).not.toContain('Partial capture from a killed lane');
    expect(err).toMatch(/codex — timed-out/);
    expect(err).toMatch(/ZERO findings/i);
  });
});

describe('killed-external lanes contribute ZERO findings (AUDIT-20260611-13)', () => {
  it('excludes an externally-killed lane’s partial capture from extraction and reports its state', async () => {
    // A lane killed by a signal the wrapper did NOT send (OOM killer,
    // out-of-band SIGTERM/SIGKILL) settles killed-external. Before the
    // fix it settled `completed` and its partial .md silently mixed into
    // the audit-log — the FR-007 "a killed lane contributes ZERO
    // findings" violation this finding names.
    const fixture = makeFixture({
      slug: 'ext-kill',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Healthy lane finding', 'src/a.ts:1'),
        // The externally-killed lane left a partial capture — forensics, never findings.
        'codex.md': findingBlock('codex', '01', 'Partial capture from an externally killed lane', 'src/b.ts:2'),
      },
      results: [
        laneResult({ name: 'claude' }),
        laneResult({
          name: 'codex',
          terminalState: 'killed-external',
          exitCode: -1,
          reportBytes: 0,
        }),
      ],
    });
    const { exit, out, err } = await lift(fixture, 'ext-kill');
    expect(exit).toBe(0);
    expect(out).toContain('Healthy lane finding');
    expect(out).not.toContain('Partial capture from an externally killed lane');
    expect(err).toMatch(/codex — killed-external/);
    expect(err).toMatch(/ZERO findings/i);
  });
});

describe('per-lane enforcement printed UNCONDITIONALLY (FR-004 at-synthesis)', () => {
  it('prints every lane’s enforcement state even on a healthy, undegraded run', async () => {
    const fixture = makeFixture({
      slug: 'healthy',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Some healthy finding here', 'src/a.ts:1'),
        'codex.md': findingBlock('codex', '01', 'Another healthy finding there', 'src/c.ts:3'),
      },
      results: [
        laneResult({ name: 'claude' }),
        laneResult({ name: 'codex', enforcement: 'unenforced', liveness: 'unmonitored', livenessWindowSeconds: undefined }),
      ],
    });
    const { err } = await lift(fixture, 'healthy');
    expect(err).toMatch(/claude — completed \[enforced, monitored\]/);
    expect(err).toMatch(/codex — completed \[unenforced, unmonitored\]/);
    // Healthy run: no degradation block.
    expect(err).not.toContain('Fleet report');
  });
});

describe('fleet report repeated when degraded (FR-007 / SC-003)', () => {
  it('repeats the degradation block in lift output', async () => {
    const fixture = makeFixture({
      slug: 'fleet',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Finding from the surviving lane', 'src/a.ts:1'),
      },
      results: [
        laneResult({ name: 'claude' }),
        laneResult({
          name: 'codex',
          terminalState: 'killed-no-liveness',
          exitCode: -1,
          reportBytes: 0,
          stalenessAtKillMs: 61000,
        }),
      ],
    });
    const { err } = await lift(fixture, 'fleet');
    expect(err).toContain('Fleet report');
    expect(err).toContain('- configured: 2, produced: 1  ⚠ DEGRADED');
    expect(err).toContain('- quorum: cross-model agreement impossible (produced ≤ 1)');
  });

  it('counts a completed-but-nonzero-exit lane as degradation, not production', async () => {
    const fixture = makeFixture({
      slug: 'rejected-pin',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Finding from the good lane', 'src/a.ts:1'),
        // The rejected-pin lane emitted a CLI error banner as its capture.
        'codex.md': 'error: unknown model id\n',
      },
      results: [
        laneResult({ name: 'claude' }),
        laneResult({ name: 'codex', exitCode: 1, reportBytes: 28 }),
      ],
    });
    const { err } = await lift(fixture, 'rejected-pin');
    expect(err).toContain('- configured: 2, produced: 1  ⚠ DEGRADED');
    // AUDIT-20260611-09: the per-lane status line must connect "completed"
    // to the fleet's exclusion — a bare "completed" next to "produced: 1
    // of 2" leaves the operator with nothing linking the two.
    expect(err).toMatch(
      /codex — completed \[enforced, monitored\] — completed but DEGRADED \[nonzero-exit \(1\)\] \(exit 1, report bytes 28\); not counted as produced/,
    );
    // AUDIT-20260611-11: the fleet report block repeats the same annotation
    // on its per-lane line — one vocabulary across all four surfaces.
    expect(err).toContain(
      '- codex: completed [enforced, monitored] — completed but DEGRADED [nonzero-exit (1)] (exit 1, report bytes 28); not counted as produced',
    );
  });
});

describe('quorum collapse surfaced independent of degradation (AUDIT-20260611-15)', () => {
  it('a healthy single-lane run prints the quorum line without the DEGRADED marker', async () => {
    // produced === configured === 1: the fleet is NOT degraded, but
    // cross-model agreement — the barrage's HIGH-confidence signal — was
    // structurally impossible. The lift must state the quorum collapse
    // rather than report a clean fleet with no fleet block at all.
    const fixture = makeFixture({
      slug: 'solo',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Finding from the only lane', 'src/a.ts:1'),
      },
      results: [laneResult({ name: 'claude' })],
    });
    const { exit, err } = await lift(fixture, 'solo');
    expect(exit).toBe(0);
    expect(err).toContain('Fleet report');
    expect(err).toContain('- configured: 1, produced: 1');
    expect(err).toContain('- quorum: cross-model agreement impossible (produced ≤ 1)');
    expect(err).not.toContain('DEGRADED');
  });
});

describe('never "clean" from a killed lane (FR-007)', () => {
  it('a zero-findings degraded run states the degradation, not a bare nothing-to-lift', async () => {
    const fixture = makeFixture({
      slug: 'killed-clean',
      modelFiles: {},
      results: [
        laneResult({
          name: 'claude',
          terminalState: 'timed-out',
          exitCode: -1,
          timedOut: true,
          reportBytes: 0,
          stdoutBytes: 0,
        }),
      ],
    });
    const { exit, err } = await lift(fixture, 'killed-clean');
    expect(exit).toBe(0);
    expect(err).toMatch(/DEGRADED/);
    expect(err).toMatch(/NOT a clean signal/i);
  });
});

describe('mixed v2 INDEX fails loud (AUDIT-20260611-07)', () => {
  it('aborts the lift with exit 2 and a descriptive error naming the degraded lane', async () => {
    const fixture = makeFixture({
      slug: 'mixed',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Finding from the intact lane', 'src/a.ts:1'),
        'codex.md': findingBlock('codex', '01', 'Finding from the drifted lane', 'src/b.ts:2'),
      },
      results: [
        laneResult({ name: 'claude' }),
        laneResult({ name: 'codex', reportBytes: 77, stdoutBytes: 77 }),
      ],
    });
    // Simulate writer drift: strip exactly codex's report-bytes row from the
    // real writer's INDEX. The dropped lane must NOT silently lower
    // `configured` until the fleet reads healthy.
    const indexPath = join(fixture.runDir, 'INDEX.md');
    const corrupted = readFileSync(indexPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '- report bytes: 77')
      .join('\n');
    writeFileSync(indexPath, corrupted, 'utf8');
    const { exit, err } = await lift(fixture, 'mixed');
    expect(exit).toBe(2);
    expect(err).toMatch(/codex/);
    expect(err).toMatch(/report bytes/);
    expect(err).toMatch(/AUDIT-20260611-07/);
  });
});

describe('pre-014 compatibility', () => {
  it('a run dir without a v2 INDEX lifts every model file (old behavior, no fleet output)', async () => {
    const fixture = makeFixture({
      slug: 'pre014',
      modelFiles: {
        'claude.md': findingBlock('claude', '01', 'Legacy run dir finding', 'src/a.ts:1'),
      },
    });
    const { exit, out, err } = await lift(fixture, 'pre014');
    expect(exit).toBe(0);
    expect(out).toContain('Legacy run dir finding');
    expect(err).not.toContain('Fleet report');
  });
});

// claude-20260612-r3 (operator bug report): a clean (0-finding) run currently
// returns WITHOUT writing a lift section, so it leaves no trace in the audit-log.
// The convergence dampener counts lift SECTIONS — so a fully-clean run is invisible
// to it, and the prior HIGH section stays in the consecutive-quiet / single-run
// window forever. The gate can then never reach OPEN even after two genuinely-clean
// runs. Fix: a HEALTHY-fleet clean run records a quiet section (0 Severity lines);
// a DEGRADED clean run still records nothing (FR-007 — absence over killed lanes is
// not a clean signal).
async function liftApply(fixture: Fixture, slug: string): Promise<{ exit: number; log: string }> {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.resume();
  stderr.resume();
  const exit = await runAuditBarrageLift({
    opts: { featureSlug: slug, runDir: fixture.runDir, date: '20260611', apply: true },
    projectRoot: fixture.repo,
    stdout,
    stderr,
  });
  const log = readFileSync(
    join(fixture.repo, 'docs', '1.0', '001-IN-PROGRESS', slug, 'audit-log.md'),
    'utf8',
  );
  return { exit, log };
}

describe('a clean HEALTHY run records a quiet lift section so the dampener counts it (claude-20260612-r3)', () => {
  it('writes a 0-findings lift section (header matches the dampener regex, no Severity lines)', async () => {
    const fixture = makeFixture({
      slug: 'clean-healthy',
      modelFiles: { 'claude.md': 'All clear — no defects found in this diff.\n' },
      results: [laneResult({ name: 'claude' })],
    });
    const { exit, log } = await liftApply(fixture, 'clean-healthy');
    expect(exit).toBe(0);
    // The dampener's section regex (## DATE — audit-barrage lift (...)) must match.
    expect(log).toMatch(/^##\s+\d{4}-\d{2}-\d{2}\s+—\s+audit-barrage\s+lift\s+\(/m);
    // It is a QUIET section — no Severity lines, so the dampener counts 0 HIGH+, 0 MEDIUM.
    expect(log).not.toMatch(/^Severity:/m);
  });

  it('a DEGRADED clean run still records NO section (FR-007 — absence over killed lanes is not clean)', async () => {
    const fixture = makeFixture({
      slug: 'clean-degraded',
      modelFiles: {},
      results: [
        laneResult({ name: 'claude' }),
        laneResult({
          name: 'codex',
          terminalState: 'timed-out',
          exitCode: -1,
          timedOut: true,
          reportBytes: 0,
          stdoutBytes: 0,
        }),
      ],
    });
    const logPath = join(fixture.repo, 'docs', '1.0', '001-IN-PROGRESS', 'clean-degraded', 'audit-log.md');
    const before = readFileSync(logPath, 'utf8');
    const { exit, log } = await liftApply(fixture, 'clean-degraded');
    expect(exit).toBe(0);
    // No section appended — the degraded clean run is not recorded as a quiet run.
    expect(log).toBe(before);
    expect(log).not.toMatch(/audit-barrage\s+lift/);
  });
});
