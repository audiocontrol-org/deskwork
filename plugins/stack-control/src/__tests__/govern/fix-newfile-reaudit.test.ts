// 030 US9 T073 (FR-007): a fix whose sole effect is creating a NEW file must have
// that file ASSIGNED to a chunk and re-audited — never dropped. The pipeline must
// not converge while a fix-created file is unaudited.
//
// RED now (TASK-415): runEndGovern consumes only `touched.chunkIds`, ignoring
// `touched.newFiles`. A fix that creates a brand-new file leaves chunkIds empty, so
// the loop breaks as "touched nothing re-auditable" at round 1 — the new file is
// silently dropped from the re-audit scope.

import { describe, expect, it } from 'vitest';
import { runEndGovern, type EndGovernDeps } from '../../govern/end-govern-pipeline.js';
import type { DiffScope } from '../../govern/payload-diff-scope.js';
import type { Finding } from '../../govern/chunk-artifacts.js';

const finding = (id: string): Finding => ({ id, title: id, severity: 'HIGH' });

describe('030 T073 — a fix-created new file is re-audited, never dropped (FR-007)', () => {
  it('re-audits a file a fix creates (does not converge with it unaudited)', async () => {
    let scopeCalls = 0;
    let auditCalls = 0;
    const auditedPayloads: string[] = [];

    // After the fix commits new.ts, a re-scope of the same base..head surfaces it —
    // the natural mechanism for assigning a fix-created file to a chunk for re-audit.
    const scopeDiff = (): DiffScope => {
      scopeCalls += 1;
      const files = scopeCalls === 1 ? ['a.ts'] : ['a.ts', 'new.ts'];
      const fileDiffs = new Map<string, string>([['a.ts', 'a'.repeat(100)]]);
      if (scopeCalls > 1) fileDiffs.set('new.ts', 'n'.repeat(100));
      return { base: 'b', head: 'h', files, fileDiffs };
    };

    const deps: EndGovernDeps = {
      scopeDiff,
      resolveEnvelope: () => 100_000, // one chunk per scope — partitioning is trivial here
      auditChunk: async (payload) => {
        auditCalls += 1;
        auditedPayloads.push(payload);
        // Round 1 raises a finding (so a fix fires); every later audit is clean.
        return auditCalls === 1 ? { findings: [finding('AUDIT-1')], degraded: false } : { findings: [], degraded: false };
      },
      planContext: () => 'PLAN',
      // The fix's sole effect is creating new.ts (e.g. extracting code into a new module).
      applyFixes: async () => ({ changedFiles: ['new.ts'], fixCommits: ['fixsha'] }),
    };

    const result = await runEndGovern(
      { installationRoot: '/root', item: 'multi:feature/x', base: 'b', head: 'h' },
      deps,
    );

    expect(
      result.record.rounds,
      'a fix that creates a new file must trigger a re-audit round, not premature convergence',
    ).toBeGreaterThanOrEqual(2);
    expect(
      auditedPayloads.some((p) => p.includes('new.ts')),
      'the fix-created new file must appear in a re-audit payload (assigned to a chunk, not dropped)',
    ).toBe(true);
  });
});
