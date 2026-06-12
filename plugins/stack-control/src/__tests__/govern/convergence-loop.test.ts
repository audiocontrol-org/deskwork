// specs/015-audit-protocol-convergence — T015 (RED): runConvergenceLoop.
//
// contracts/convergence-loop.md. The driver owns the iterate/stop decision and
// the FR-014 ceiling; it consumes the gate's single OPEN/BLOCKED boolean and
// terminates deterministically in every branch (SC-004). The agent's only
// in-loop action is `dispatchFix` — the sole mutation seam (FR-005, no auto-edit).

import { describe, it, expect, vi } from 'vitest';
import { runConvergenceLoop } from '../../govern/convergence-loop.js';
import type { AuditUnit } from '../../govern/audit-unit-types.js';

const unit: AuditUnit = {
  granularity: 'feature',
  diffScope: { base: 'HEAD~1', files: [] },
  auditLogSection: 'after_implement',
};

describe('runConvergenceLoop (mechanical termination, FR-004/005)', () => {
  it('OPEN on pass 1 → converged at rounds:1, dispatchFix never called', async () => {
    const runPass = vi.fn(async () => ({ gateOpen: true }));
    const dispatchFix = vi.fn(async () => {});
    const outcome = await runConvergenceLoop({ unit, ceiling: 5, runPass, dispatchFix });
    expect(outcome).toEqual({ kind: 'converged', rounds: 1 });
    expect(runPass).toHaveBeenCalledTimes(1);
    expect(dispatchFix).not.toHaveBeenCalled();
  });

  it('always BLOCKED, ceiling 5 → non-converged at rounds:5; dispatchFix called exactly 4 times', async () => {
    const runPass = vi.fn(async () => ({ gateOpen: false }));
    const dispatchFix = vi.fn(async () => {});
    const outcome = await runConvergenceLoop({ unit, ceiling: 5, runPass, dispatchFix });
    expect(outcome).toEqual({ kind: 'non-converged', rounds: 5, ceiling: 5 });
    expect(runPass).toHaveBeenCalledTimes(5);
    // No fix-dispatch on the final ceiling round — the loop stops, it does not fix.
    expect(dispatchFix).toHaveBeenCalledTimes(4);
  });

  it('BLOCKED twice then OPEN, ceiling 5 → converged at rounds:3; dispatchFix twice', async () => {
    const gates = [false, false, true];
    const runPass = vi.fn(async () => ({ gateOpen: gates.shift() ?? true }));
    const dispatchFix = vi.fn(async () => {});
    const outcome = await runConvergenceLoop({ unit, ceiling: 5, runPass, dispatchFix });
    expect(outcome).toEqual({ kind: 'converged', rounds: 3 });
    expect(dispatchFix).toHaveBeenCalledTimes(2);
  });

  it('override set → overridden regardless of the gate; runPass not required to run', async () => {
    const runPass = vi.fn(async () => ({ gateOpen: false }));
    const dispatchFix = vi.fn(async () => {});
    const outcome = await runConvergenceLoop({
      unit,
      ceiling: 5,
      runPass,
      dispatchFix,
      override: { reason: 'residual findings are implementation-altitude (operator call)' },
    });
    expect(outcome.kind).toBe('overridden');
    if (outcome.kind === 'overridden') {
      expect(outcome.reason).toMatch(/implementation-altitude/);
    }
    expect(runPass).not.toHaveBeenCalled();
    expect(dispatchFix).not.toHaveBeenCalled();
  });

  it('dispatchFix is the ONLY mutation seam — the driver invokes no other callback (FR-005)', async () => {
    // The driver receives exactly two behavioral callbacks (runPass, dispatchFix).
    // Between rounds the only thing it calls is dispatchFix; it never edits the
    // tree itself. We assert by confirming the call counts reconcile exactly.
    const gates = [false, true];
    const runPass = vi.fn(async () => ({ gateOpen: gates.shift() ?? true }));
    const dispatchFix = vi.fn(async () => {});
    await runConvergenceLoop({ unit, ceiling: 5, runPass, dispatchFix });
    expect(runPass).toHaveBeenCalledTimes(2);
    expect(dispatchFix).toHaveBeenCalledTimes(1);
  });

  it('a runPass rejection propagates as a loud failure (never a silent stop)', async () => {
    const runPass = vi.fn(async () => {
      throw new Error('barrage OUTAGE');
    });
    const dispatchFix = vi.fn(async () => {});
    await expect(
      runConvergenceLoop({ unit, ceiling: 5, runPass, dispatchFix }),
    ).rejects.toThrow(/OUTAGE/);
  });
});
