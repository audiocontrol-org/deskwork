// 030 govern dogfood — AUDIT-20260622-18 (RED first). US9 made the impl graduate
// gate read `isImplFeatureConverged` (validates a WholeFeatureConvergenceRecord),
// but the `--override` path still wrote the RETIRED GovernConvergenceRecord shape
// (recordGovernConvergence) to the same impl record path. So an impl override
// printed "graduated" while the gate stayed CLOSED — the record was foreign-shaped
// and isImplFeatureConverged returned false (the exact CLI-success/gate-signal
// divergence the override path exists to prevent). The fix: impl-mode override
// writes a gate-readable WholeFeatureConvergenceRecord with override attribution;
// spec-mode is unchanged. Watched to FAIL while impl override writes the old shape.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordOverrideGraduation } from '../../govern/override-graduate.js';
import { isImplFeatureConverged } from '../../govern/chunk-artifacts.js';

describe('030 AUDIT-20260622-18 — impl override opens the whole-feature graduate gate', () => {
  it('an impl-mode override writes a record isImplFeatureConverged reads as graduated', () => {
    const root = mkdtempSync(join(tmpdir(), 'impl-override-'));
    try {
      const item = 'multi:feature/x';
      expect(isImplFeatureConverged(root, item)).toBe(false); // nothing written yet
      recordOverrideGraduation({
        installationRoot: root,
        mode: 'impl',
        convergenceItem: item,
        scopePaths: [join(root, 'specs/030-x')],
        feature: '030-x',
        reason: 'operator accepts the residual backlogged findings',
        recordedAt: '2026-06-22T00:00:00.000Z',
        stderr: () => {},
      });
      // The durable record the gate reads MUST open the gate (CLI success ⟺ gate signal).
      expect(isImplFeatureConverged(root, item)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an impl override does NOT open the gate for a DIFFERENT item (path-keyed)', () => {
    const root = mkdtempSync(join(tmpdir(), 'impl-override-'));
    try {
      recordOverrideGraduation({
        installationRoot: root,
        mode: 'impl',
        convergenceItem: 'multi:feature/x',
        scopePaths: [],
        feature: '030-x',
        reason: 'r',
        recordedAt: '2026-06-22T00:00:00.000Z',
        stderr: () => {},
      });
      expect(isImplFeatureConverged(root, 'multi:feature/other')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
