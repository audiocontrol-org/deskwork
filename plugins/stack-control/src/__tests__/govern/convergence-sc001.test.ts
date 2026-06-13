// specs/015-audit-protocol-convergence — T014 (RED→GREEN integration, SC-001).
//
// Replay the 014 rounds-4–7 finding stream (one cluster per round: opus=high,
// codex=medium) through the REAL lift into a shared audit-log, then evaluate the
// dampener. Under cross-lane agreement each round raw-surfaces 0 HIGH (the
// cluster gate-counts MEDIUM), so two consecutive quiet runs engage the dampener
// → the gate would be OPEN. Under the retired max-of-cluster rule each section
// would have recorded HIGH and the dampener would stay disengaged (BLOCKED) —
// the contrast assertion pins that this is the behavior change, not a tautology.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { runAuditBarrageLift } from '../../subcommands/audit-barrage-lift.js';
import { checkBarrageDampener } from '../../scope-discovery/promote-findings/check-barrage-dampener.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const repos: string[] = [];
afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true });
});

function clusterFile(model: string, severity: string): string {
  return [
    `### Single-lane severity inflation on a consistency seam (${model})`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-01`,
    'Status:     open',
    `Severity:   ${severity}`,
    'Surface:    src/scope-discovery/promote-findings/seam.ts:262',
    '',
    `Body from ${model}: the lanes disagree on severity for this seam.`,
    '',
  ].join('\n');
}

async function liftRound(repo: string, slug: string, round: number): Promise<void> {
  const runDir = join(
    repo,
    '.stack-control',
    'audit-runs',
    `20260611T0${round}0000000Z-${slug}-round${round}`,
  );
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'opus.md'), clusterFile('opus', 'high'), 'utf8');
  writeFileSync(join(runDir, 'codex.md'), clusterFile('codex', 'medium'), 'utf8');
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.resume();
  stderr.resume();
  await runAuditBarrageLift({
    opts: { featureSlug: slug, runDir, date: '20260611', apply: true },
    projectRoot: repo,
    stdout,
    stderr,
  });
}

describe('SC-001: a single-lane-inflation stream converges (agreement de-inflation)', () => {
  it('lifts 4 rounds of opus=high/codex=medium and the dampener ENGAGES (gate OPEN)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'sc001-'));
    repos.push(repo);
    const slug = 'audit-protocol';
    const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'audit-log.md'), '# Audit Log\n', 'utf8');

    for (let round = 4; round <= 7; round += 1) {
      await liftRound(repo, slug, round);
    }
    const log = readFileSync(join(featureDir, 'audit-log.md'), 'utf8');
    // Every lifted section gate-counted MEDIUM (agreement), not HIGH.
    expect(log).toMatch(/^Severity:\s*medium/m);
    expect(log).not.toMatch(/^Severity:\s*high/m);

    const dampener = checkBarrageDampener({ auditLogText: log, threshold: 2 });
    // Two consecutive raw-0-HIGH runs → dampened (the loop can converge).
    expect(dampener.dampened).toBe(true);
  });

  it('contrast: the same stream recorded as max-of-cluster HIGH stays BLOCKED', () => {
    // The retired behavior — each round records HIGH — keeps the dampener
    // disengaged. This is the defect SC-001 fixes; pin that it WAS a defect.
    const maxOfClusterLog = [4, 5, 6, 7]
      .map(
        (r) =>
          `## 2026-06-11 — audit-barrage lift (run-round${r})\n\n` +
          `### AUDIT-20260611-0${r - 3} — seam\n\n` +
          `Finding-ID: AUDIT-20260611-0${r - 3}\nStatus:     open\nSeverity:   high\n` +
          `Surface:    src/x.ts:1\n\nbody\n`,
      )
      .join('\n');
    const dampener = checkBarrageDampener({ auditLogText: maxOfClusterLog, threshold: 2 });
    expect(dampener.dampened).toBe(false);
  });

  it('the static rounds-4-7 fixture audit-log also engages the dampener', () => {
    const fixture = readFileSync(
      join(HERE, '..', 'fixtures', 'convergence', 'rounds-4-7-audit-log.md'),
      'utf8',
    );
    const dampener = checkBarrageDampener({ auditLogText: fixture, threshold: 2 });
    expect(dampener.dampened).toBe(true);
  });
});
