// TASK-439 (RED first) — a no-op fix must NOT converge with unfixed findings.
// When applyFixes returns SUCCESS but changedFiles:[] (the fix subagent "succeeded"
// yet changed nothing), the touched set is empty, so the loop previously set
// openFindings=[] and broke — reconciling to `converged` and marking the still-open
// findings closed-in-loop. A fix that changed nothing left the findings unfixed:
// the run must surface `fix-failure-surfaced`, never graduate. UNREACHABLE in
// production today (applyFixes deferred, TASK-424) but guarded here.

import { describe, expect, it } from 'vitest';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';
import type { Finding } from '../../govern/chunk-artifacts.js';

const finding = (id: string): Finding => ({ id, title: id, severity: 'HIGH' });

describe('TASK-439 — a no-op fix surfaces fix-failure, never converges', () => {
  it('does NOT mark findings closed when the fix changed nothing', async () => {
    const scopeDiff = (): DiffScope => ({
      base: 'b',
      head: 'h',
      files: ['a.ts'],
      fileDiffs: new Map<string, string>([['a.ts', 'a'.repeat(100)]]),
    });

    const deps: EndGovernDeps = {
      scopeDiff,
      resolveEnvelope: () => 100_000,
      auditChunk: async () => ({ findings: [finding('AUDIT-1')], degraded: false }),
      planContext: () => 'PLAN',
      // The fix "succeeds" (no failed chunks, no unresolvable merges) but changes nothing.
      applyFixes: async () => ({ changedFiles: [], fixCommits: [] }),
    };

    const result = await runEndGovern(
      { installationRoot: '/root', item: 'multi:feature/x', base: 'b', head: 'h' },
      deps,
    );

    expect(result.record.outcome, 'a no-op fix must not graduate').toBe('fix-failure-surfaced');
    expect(
      result.record.liftedFindings.map((f) => f.id),
      'the unfixed finding stays SURFACED (lifted), not silently closed-in-loop',
    ).toContain('AUDIT-1');
    expect(
      result.record.closedInLoopFindings.map((f) => f.id),
      'an unfixed finding must NOT be recorded as closed-in-loop',
    ).not.toContain('AUDIT-1');
  });
});
