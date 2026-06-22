// TASK-109 (re-aimed from the deleted per-phase writer to the surviving whole-feature
// writer) — writeWholeFeatureConvergenceRecord writes a temp file then renames it
// atomically. A crash between write and rename leaves an orphan `<path>.<uuid>.tmp`
// sibling; across repeated crashes these accumulate in the convergence dir. The
// writer must REAP stale temp siblings so the dir never litters torn temp files.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  writeWholeFeatureConvergenceRecord,
  readWholeFeatureConvergenceRecord,
} from '../../govern/chunk-artifacts.js';
import { convergenceRecordPath } from '../../govern/convergence-record.js';
import type { WholeFeatureConvergenceRecord } from '../../govern/chunk-artifacts.js';

function record(root: string): WholeFeatureConvergenceRecord {
  return {
    version: 1,
    mode: 'impl',
    item: 'multi:feature/x',
    governedShaBase: 'b',
    headSha: 'h',
    chunkIds: ['c1'],
    rounds: 1,
    liftedFindings: [],
    closedInLoopFindings: [],
    seamResult: { boundaryPairs: [], findings: [], suppressedCompatible: 0 },
    splitClusterRefs: [],
    outcome: 'converged',
    anchorRoot: root,
  };
}

describe('TASK-109 — convergence record write reaps orphan torn temp files', () => {
  it('removes a stale .tmp sibling and leaves exactly the real record', () => {
    const root = mkdtempSync(join(tmpdir(), 'conv-io-'));
    try {
      const path = convergenceRecordPath(root, 'impl', 'multi:feature/x');
      const dir = dirname(path);
      mkdirSync(dir, { recursive: true });
      // Simulate a torn temp left by a crash between write and rename.
      const orphan = `${path}.deadbeef-orphan.tmp`;
      writeFileSync(orphan, '{ partial');
      expect(existsSync(orphan)).toBe(true);

      writeWholeFeatureConvergenceRecord(root, record(root));

      const leftovers = readdirSync(dir).filter((f) => f.endsWith('.tmp'));
      expect(leftovers, 'no torn temp files may remain after a successful write').toEqual([]);
      // The real record is present and valid.
      expect(readWholeFeatureConvergenceRecord(root, 'multi:feature/x').outcome).toBe('converged');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
