// TASK-440 (RED first) — seam-pass findings can drive a non-converged
// (override-eligible) outcome while liftedFindings is empty. The operator-facing
// "implementation NOT done" message must SURFACE those seam breaks (kind + symbol),
// else the operator sees "0 open findings" + a blocked run and cannot tell what
// blocked. The renderer is pure so it is testable without process.exit.

import { describe, expect, it } from 'vitest';
import { renderEndGovernNotDoneMessage } from '../../govern/end-govern-message.js';
import type { WholeFeatureConvergenceRecord } from '../../govern/chunk-artifacts.js';

function record(over: Partial<WholeFeatureConvergenceRecord>): WholeFeatureConvergenceRecord {
  return {
    version: 1,
    mode: 'impl',
    item: 'multi:feature/x',
    governedShaBase: 'b',
    headSha: 'h',
    chunkIds: ['c1', 'c2'],
    rounds: 1,
    liftedFindings: [],
    closedInLoopFindings: [],
    seamResult: { boundaryPairs: [], findings: [], suppressedCompatible: 0 },
    splitClusterRefs: [],
    outcome: 'override-eligible',
    anchorRoot: '/install',
    ...over,
  };
}

describe('TASK-440 — end-govern NOT-done message surfaces seam findings', () => {
  it('names the seam break (kind + symbol) when seam findings blocked the run', () => {
    const r = record({
      liftedFindings: [],
      seamResult: {
        boundaryPairs: [],
        suppressedCompatible: 0,
        findings: [{ kind: 'removed-export', symbol: 'foo', consumedAcross: true, severity: 'HIGH' }],
      },
    });
    const msg = renderEndGovernNotDoneMessage(r);
    expect(msg).toMatch(/removed-export/);
    expect(msg).toMatch(/foo/);
    expect(msg).toMatch(/seam/i);
  });

  it('reports the seam-finding count alongside the open-finding count (no misleading "0 open")', () => {
    const r = record({
      seamResult: {
        boundaryPairs: [],
        suppressedCompatible: 0,
        findings: [
          { kind: 'changed-arity', symbol: 'bar', consumedAcross: true, severity: 'HIGH' },
          { kind: 'changed-required-shape', symbol: 'Cfg', consumedAcross: true, severity: 'HIGH' },
        ],
      },
    });
    const msg = renderEndGovernNotDoneMessage(r);
    expect(msg).toMatch(/2 .*seam/i);
    expect(msg).toMatch(/bar/);
    expect(msg).toMatch(/Cfg/);
  });

  it('omits a seam section entirely when there are no seam findings', () => {
    const msg = renderEndGovernNotDoneMessage(record({ outcome: 'override-eligible' }));
    expect(msg).not.toMatch(/seam/i);
    expect(msg).toMatch(/NOT done/);
  });

  it('keeps the degraded-fleet advice when the outcome is degraded-fleet-surfaced', () => {
    const msg = renderEndGovernNotDoneMessage(record({ outcome: 'degraded-fleet-surfaced' }));
    expect(msg).toMatch(/degraded/i);
  });
});
