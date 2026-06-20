/**
 * specs/029-govern-operability — Phase 2 / US2 (T008, RED).
 *
 * FR-006: each lane's terminal state — completed / timed-out /
 * killed-no-liveness / killed-external / zero-byte — must be surfaced
 * DISTINCTLY at synthesis (the fleet report) and at lift. In particular a
 * `zero-byte` lane (settled `completed` but produced 0 report bytes) must be
 * named as such, not left looking like a healthy `completed` lane; and a lift
 * section recorded over a degraded fleet must carry the `Fleet: DEGRADED`
 * marker the dampener reads (FR-007 substrate).
 */

import { describe, expect, it } from 'vitest';
import { completedNonConvergedAnnotation } from '../../src/scope-discovery/audit-barrage/types.js';
import {
  renderSection,
  type SectionFleetStatus,
} from '../../src/subcommands/audit-barrage-lift-render.js';
import type { ExtractedFinding } from '../../src/scope-discovery/promote-findings/extract-barrage-findings.js';

function aFinding(): ExtractedFinding {
  return {
    heading: 'a finding',
    severity: 'medium',
    surface: 'src/x.ts:1',
    body: 'body',
    sourceModels: ['codex'],
    sourceFindingIds: ['AUDIT-BARRAGE-codex-01'],
    crossModelAgreement: false,
    perLaneSeverities: [{ model: 'codex', severity: 'medium' }],
    severityDecision: { rule: 'single-model', gateCountedSeverity: 'medium' },
  };
}

describe('zero-byte lane is surfaced distinctly from healthy completed (US2, FR-006)', () => {
  it('names a completed-but-zero-byte lane as zero-byte (degraded), not bare completed', () => {
    const annotation = completedNonConvergedAnnotation({
      terminalState: 'completed',
      exitCode: 0,
      reportBytes: 0,
    });
    expect(annotation).not.toBe('');
    expect(annotation.toLowerCase()).toContain('zero-byte');
  });

  it('does NOT annotate a healthy completed lane (real output)', () => {
    const annotation = completedNonConvergedAnnotation({
      terminalState: 'completed',
      exitCode: 0,
      reportBytes: 4096,
    });
    expect(annotation).toBe('');
  });

  it('still distinguishes a nonzero-exit completed lane from a zero-byte one', () => {
    const nonzeroExit = completedNonConvergedAnnotation({
      terminalState: 'completed',
      exitCode: 3,
      reportBytes: 100,
    });
    expect(nonzeroExit).not.toBe('');
    expect(nonzeroExit.toLowerCase()).not.toContain('zero-byte');
  });
});

describe('lift section carries the degraded marker only when degraded (US2, FR-007)', () => {
  it('stamps Fleet: DEGRADED when produced < configured', () => {
    const degraded: SectionFleetStatus = { produced: 1, configured: 2 };
    const { section } = renderSection([aFinding()], '20260620', 1, 'run-deg', degraded);
    expect(section).toMatch(/Fleet:\s*DEGRADED/i);
    expect(section).toContain('produced 1 of 2');
  });

  it('omits the marker for a healthy fleet (produced === configured)', () => {
    const healthy: SectionFleetStatus = { produced: 2, configured: 2 };
    const { section } = renderSection([aFinding()], '20260620', 1, 'run-ok', healthy);
    expect(section).not.toMatch(/Fleet:\s*DEGRADED/i);
  });

  it('omits the marker when no fleet status is supplied (back-compat)', () => {
    const { section } = renderSection([aFinding()], '20260620', 1, 'run-legacy');
    expect(section).not.toMatch(/Fleet:\s*DEGRADED/i);
  });
});
