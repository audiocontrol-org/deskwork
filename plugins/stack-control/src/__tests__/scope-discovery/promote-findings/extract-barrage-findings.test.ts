// specs/015-audit-protocol-convergence — T010 (RED): mergeCluster delegates
// severity to the agreement computation and preserves the per-lane inputs.
//
//   - extractBarrageFindings sets `severity = gateCountedSeverity` (agreement),
//     NOT max-of-cluster: an opus=high + codex=medium cluster lifts as MEDIUM.
//   - it populates `perLaneSeverities` (one entry per covering lane) and
//     `severityDecision` (the recorded rule + gate-counted result).
//   - `crossModelAgreement` stays `sourceModels.length >= 2` — it is existence
//     clustering, ORTHOGONAL to the de-inflated severity (FR-003).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractBarrageFindings } from '../../../scope-discovery/promote-findings/extract-barrage-findings.js';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function modelFile(model: string, nn: string, severity: string, surface: string): string {
  return [
    `### Severity-disagreement seam between lanes (${model})`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    `Severity:   ${severity}`,
    `Surface:    ${surface}`,
    '',
    `Body from ${model}: a parser edge case in the field walker.`,
    '',
  ].join('\n');
}

function runDirWith(files: Record<string, string>): string {
  const runDir = mkdtempSync(join(tmpdir(), 'extract-sev-'));
  dirs.push(runDir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(runDir, name), content, 'utf8');
  }
  return runDir;
}

describe('extractBarrageFindings severity de-inflation (FR-001/002/003)', () => {
  it('lifts an opus=high + codex=medium cluster as MEDIUM (agreement, not max)', async () => {
    // Same surface path token → the two findings cluster.
    const runDir = runDirWith({
      'opus.md': modelFile('opus', '01', 'high', 'src/scope-discovery/seam.ts:262'),
      'codex.md': modelFile('codex', '01', 'medium', 'src/scope-discovery/seam.ts:262'),
    });
    const findings = await extractBarrageFindings({ runDir, warn: () => {} });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.severity).toBe('medium'); // was 'high' under max-of-cluster
    expect(f.crossModelAgreement).toBe(true);
  });

  it('preserves per-lane severities and the severity decision on the merged finding', async () => {
    const runDir = runDirWith({
      'opus.md': modelFile('opus', '01', 'high', 'src/scope-discovery/seam.ts:262'),
      'codex.md': modelFile('codex', '01', 'medium', 'src/scope-discovery/seam.ts:262'),
    });
    const [f] = await extractBarrageFindings({ runDir, warn: () => {} });
    const models = (f!.perLaneSeverities ?? []).map((p) => p.model).sort();
    expect(models).toEqual(['codex', 'opus']);
    const opus = f!.perLaneSeverities!.find((p) => p.model === 'opus');
    const codex = f!.perLaneSeverities!.find((p) => p.model === 'codex');
    expect(opus?.severity).toBe('high');
    expect(codex?.severity).toBe('medium');
    expect(f!.severityDecision.gateCountedSeverity).toBe('medium');
    expect(f!.severityDecision.rule).toBe('agreement');
  });

  it('crossModelAgreement stays existence-based (≥2 lanes) independent of de-inflation (FR-003)', async () => {
    const runDir = runDirWith({
      'opus.md': modelFile('opus', '01', 'high', 'src/scope-discovery/seam.ts:262'),
      'codex.md': modelFile('codex', '01', 'medium', 'src/scope-discovery/seam.ts:262'),
    });
    const [f] = await extractBarrageFindings({ runDir, warn: () => {} });
    // Severity de-inflated to medium, but the existence agreement is unchanged.
    expect(f!.severity).toBe('medium');
    expect(f!.crossModelAgreement).toBe(true);
    expect(f!.sourceModels.length).toBe(2);
  });

  it('a genuine ≥2-lane HIGH stays HIGH (no suppression of real signal — SC-003)', async () => {
    const runDir = runDirWith({
      'opus.md': modelFile('opus', '01', 'high', 'src/scope-discovery/real.ts:99'),
      'codex.md': modelFile('codex', '01', 'high', 'src/scope-discovery/real.ts:99'),
    });
    const [f] = await extractBarrageFindings({ runDir, warn: () => {} });
    expect(f!.severity).toBe('high');
  });

  it('a single-model finding keeps its lane severity (004 FR-003 preserved)', async () => {
    const runDir = runDirWith({
      'opus.md': modelFile('opus', '01', 'high', 'src/scope-discovery/solo.ts:1'),
    });
    const [f] = await extractBarrageFindings({ runDir, warn: () => {} });
    expect(f!.severity).toBe('high');
    expect(f!.severityDecision.rule).toBe('single-model');
  });
});

// AUDIT-20260612-02 — disagreement floor: a WIDE intra-cluster spread (dominant
// lane ≥2 levels above the agreement floor, e.g. [high, informational]) must NOT
// collapse to informational. It routes through adjudication so the dominant
// severity is re-scored on the body's evidence — kept when the body reads as a
// real defect, calibrated to ≤medium only on low-blast/unreachable/fix-debt — and
// is never silently floored to informational (the inverse of SC-003).
function modelFileWithBody(
  model: string,
  nn: string,
  severity: string,
  surface: string,
  body: string,
): string {
  return [
    `### Wide severity spread between lanes (${model})`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    `Severity:   ${severity}`,
    `Surface:    ${surface}`,
    '',
    body,
    '',
  ].join('\n');
}

describe('extractBarrageFindings disagreement floor (AUDIT-20260612-02)', () => {
  it('[high, informational] with a neutral body does NOT collapse to informational — it adjudicates, keeping high', async () => {
    const runDir = runDirWith({
      'opus.md': modelFile('opus', '01', 'high', 'src/govern/wide.ts:9'),
      'codex.md': modelFile('codex', '01', 'informational', 'src/govern/wide.ts:9'),
    });
    const [f] = await extractBarrageFindings({ runDir, warn: () => {} });
    expect(f!.severity).not.toBe('informational');
    expect(f!.severity).toBe('high');
    expect(f!.severityDecision.rule).toBe('adjudicated');
    expect(f!.severityDecision.adjudicationBasis).toBeDefined();
  });

  it('[high, informational] on low-blast/unreachable evidence adjudicates DOWN to medium (not informational, not high)', async () => {
    const runDir = runDirWith({
      'opus.md': modelFileWithBody(
        'opus',
        '01',
        'high',
        'src/govern/wide2.ts:9',
        'This is a latent, minor nit on an internal path that is unreachable via the public CLI.',
      ),
      'codex.md': modelFile('codex', '01', 'informational', 'src/govern/wide2.ts:9'),
    });
    const [f] = await extractBarrageFindings({ runDir, warn: () => {} });
    expect(f!.severity).toBe('medium');
    expect(f!.severityDecision.rule).toBe('adjudicated');
  });

  it('[high, medium] (a 1-level spread) is NOT routed to adjudication — it stays the agreement floor MEDIUM (spec [high,medium]→medium preserved)', async () => {
    const runDir = runDirWith({
      'opus.md': modelFile('opus', '01', 'high', 'src/govern/narrow.ts:9'),
      'codex.md': modelFile('codex', '01', 'medium', 'src/govern/narrow.ts:9'),
    });
    const [f] = await extractBarrageFindings({ runDir, warn: () => {} });
    expect(f!.severity).toBe('medium');
    expect(f!.severityDecision.rule).toBe('agreement');
  });
});
