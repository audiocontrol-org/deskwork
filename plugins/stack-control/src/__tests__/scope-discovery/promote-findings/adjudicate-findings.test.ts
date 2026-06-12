// specs/015-audit-protocol-convergence — T008 (RED): adjudicate.
//
// The second-stage re-score for residual single-lane inflations that agreement
// (D1) cannot resolve — consistency-seam / prior-round fix-code findings whose
// own prose self-assesses low/latent blast radius (the 014 AUDIT-19/-21 shape).
// contracts/cluster-severity.md § adjudicate-findings.ts is the authority.
//
//   - low-blast-radius + unreachable + fix-debt single-lane HIGH → ≤ medium,
//     with a non-empty recorded basis (SC-002).
//   - a reachable data-loss HIGH → stays high (no suppression of real signal,
//     SC-003), basis records "reachable; not calibrated down".
//   - the basis string is ALWAYS non-empty for rule === 'adjudicated'.

import { describe, it, expect } from 'vitest';
import { adjudicate } from '../../../scope-discovery/promote-findings/adjudicate-findings.js';

const SEVERITY_RANK = { blocking: 4, high: 3, medium: 2, low: 1, informational: 0 } as const;

describe('adjudicate (residual single-lane inflation re-score, FR-001 mechanism C)', () => {
  it('single-lane HIGH that is unreachable + fix-debt → calibrated to ≤ medium with basis', () => {
    const d = adjudicate({
      perLane: [{ model: 'opus', severity: 'high' }],
      body:
        'This is a consistency seam in the prior round\'s fix-code. It is currently ' +
        'unreachable via the public path — only an internal caller could hit it — and ' +
        'the blast radius is genuinely low.',
    });
    expect(d.rule).toBe('adjudicated');
    expect(SEVERITY_RANK[d.gateCountedSeverity]).toBeLessThanOrEqual(SEVERITY_RANK.medium);
    expect(d.adjudicationBasis).toBeDefined();
    expect((d.adjudicationBasis ?? '').length).toBeGreaterThan(0);
  });

  it('single-lane HIGH describing a reachable data-loss defect → stays high, basis records why', () => {
    const d = adjudicate({
      perLane: [{ model: 'opus', severity: 'high' }],
      body:
        'A reachable data-loss defect: the public `promote` path drops findings when the ' +
        'keying diverges, silently corrupting the audit record. Reachable from the CLI.',
    });
    expect(d.gateCountedSeverity).toBe('high');
    expect(d.rule).toBe('adjudicated');
    expect((d.adjudicationBasis ?? '').length).toBeGreaterThan(0);
    expect(d.adjudicationBasis).toMatch(/reachable/i);
  });

  it('the basis is always non-empty for an adjudicated decision (never silent — Constitution V)', () => {
    const d = adjudicate({
      perLane: [{ model: 'opus', severity: 'high' }],
      body: 'Latent edge case; low blast radius; unreachable in practice.',
    });
    expect(d.rule).toBe('adjudicated');
    expect((d.adjudicationBasis ?? '').trim().length).toBeGreaterThan(0);
  });

  it('preserves the per-lane inputs on the decision (auditability, FR-002)', () => {
    const perLane = [{ model: 'opus', severity: 'high' as const }];
    const d = adjudicate({ perLane, body: 'currently unreachable, low blast radius, fix-code' });
    expect(d.perLane).toEqual(perLane);
  });
});
