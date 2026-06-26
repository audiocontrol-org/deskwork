// H1 cluster (specs/029 US2/US3) — the degraded quiet-section + dampener contract.
// renderQuietSection has a DUAL responsibility: a healthy 0-finding run records a quiet
// section the dampener counts; a DEGRADED 0-finding run records a `Fleet: DEGRADED`-marked
// section the dampener must NEVER count as quiet (absence over killed lanes is not clean,
// FR-007). These tests pin that contract end to end and the diagnostic-message accuracy
// findings that rode the same cluster:
//   TASK-344 — renderQuietSection degraded path had no unit test.
//   TASK-339/356 — no round-trip test renderQuietSection(degraded) → checkBarrageDampener.
//   TASK-355 — single-run-clean success reason said "NEW-or-persistent HIGH+" but the rule
//              gates on the RAW count.
//   TASK-336 — not-dampened diagnostic silenced a degraded run when a HIGH run coexisted.
//   TASK-345 — completedNonConvergedAnnotation dropped the nonzero-exit kind when bytes=0.

import { describe, it, expect } from 'vitest';
import { renderQuietSection } from '../../../subcommands/audit-barrage-lift-render.js';
import { checkBarrageDampener } from '../../../scope-discovery/promote-findings/check-barrage-dampener.js';
import { completedNonConvergedAnnotation } from '../../../scope-discovery/audit-barrage/types.js';

const DATE = '20260625';

describe('renderQuietSection degraded path (TASK-344)', () => {
  it('a healthy 0-finding run renders a quiet section with no DEGRADED marker', () => {
    const section = renderQuietSection(DATE, 'run-healthy');
    expect(section).toContain('## 2026-06-25 — audit-barrage lift (run-healthy)');
    expect(section).not.toMatch(/Fleet:\s*DEGRADED/i);
  });

  it('a DEGRADED 0-finding run renders a section carrying the Fleet: DEGRADED marker', () => {
    const section = renderQuietSection(DATE, 'run-degraded', { produced: 1, configured: 2 });
    expect(section).toContain('## 2026-06-25 — audit-barrage lift (run-degraded)');
    expect(section).toMatch(/Fleet:\s*DEGRADED\b/i);
    expect(section).toContain('produced 1 of 2 configured');
  });
});

describe('round-trip renderQuietSection(degraded) → checkBarrageDampener (TASK-339/356)', () => {
  it('a degraded quiet section is read back as degraded and does NOT dampen', () => {
    const auditLog = renderQuietSection(DATE, 'run-degraded', { produced: 1, configured: 2 });
    const result = checkBarrageDampener({ auditLogText: auditLog });
    expect(result.recentRunCounts).toHaveLength(1);
    expect(result.recentRunCounts[0]!.degraded).toBe(true);
    expect(result.dampened).toBe(false);
    expect(result.reason).toMatch(/DEGRADED/i);
  });

  it('a healthy quiet section IS read back as quiet and dampens (single-run rule)', () => {
    const auditLog = renderQuietSection(DATE, 'run-healthy');
    const result = checkBarrageDampener({ auditLogText: auditLog });
    expect(result.recentRunCounts[0]!.degraded).toBe(false);
    expect(result.dampened).toBe(true);
  });
});

describe('single-run-clean diagnostic reflects the RAW gate (TASK-355)', () => {
  it('the success reason does not claim the NEW-or-persistent basis for the single-run rule', () => {
    const auditLog = renderQuietSection(DATE, 'run-healthy');
    const { reason, dampened } = checkBarrageDampener({ auditLogText: auditLog });
    expect(dampened).toBe(true);
    expect(reason).toContain('single-run rule');
    // The single-run rule gates on rawHighPlusCount/rawMediumCount, NOT the
    // jitter-tolerant newHighPlusCount — its reason must not imply otherwise.
    expect(reason).not.toMatch(/NEW-or-persistent HIGH\+ AND 0 MEDIUM/i);
  });
});

describe('not-dampened diagnostic surfaces a degraded run even when a HIGH run coexists (TASK-336)', () => {
  it('names both the HIGH run and the degraded run in the window', () => {
    // Window (threshold 2): oldest = a degraded 0-finding run; newest = a HIGH run.
    const degraded = renderQuietSection(DATE, 'run-degraded', { produced: 1, configured: 2 });
    const highSection = [
      '## 2026-06-25 — audit-barrage lift (run-high)',
      '',
      '### AUDIT-20260625-01 — a real defect',
      '',
      'Finding-ID: AUDIT-20260625-01',
      'Status:     open',
      'Severity:   high',
      'Surface:    src/x.ts:1',
      '',
      'body',
      '',
    ].join('\n');
    const auditLog = `${degraded}\n${highSection}\n`;
    const { reason, dampened } = checkBarrageDampener({ auditLogText: auditLog });
    expect(dampened).toBe(false);
    expect(reason).toMatch(/HIGH\+/);
    expect(reason).toMatch(/DEGRADED/i);
  });
});

describe('completedNonConvergedAnnotation surfaces nonzero exit even at zero bytes (TASK-345)', () => {
  it('a completed lane with nonzero exit AND zero report bytes names both sub-states', () => {
    const ann = completedNonConvergedAnnotation({
      terminalState: 'completed',
      exitCode: 1,
      reportBytes: 0,
    });
    expect(ann).toMatch(/zero-byte/);
    expect(ann).toMatch(/nonzero-exit \(1\)/);
  });

  it('a clean completed lane (exit 0, bytes > 0) is not annotated', () => {
    expect(
      completedNonConvergedAnnotation({ terminalState: 'completed', exitCode: 0, reportBytes: 42 }),
    ).toBe('');
  });
});
