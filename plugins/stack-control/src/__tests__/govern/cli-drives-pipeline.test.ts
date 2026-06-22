// 030 US9 T069 (FR-024/026, SC-008): the implement-mode CLI DRIVES the end-govern
// pipeline (runEndGovern) and persists exactly ONE whole-feature convergence record
// — it does NOT loop runProtocol per chunk (the stand-in that ballooned one audit-log
// lift section per chunk). This is the missing ship gate: last session the pipeline
// existed but govern.ts never called it, and a green unit suite hid the unwired seam.
//
// RED now: the implement arm loops `auditChunkPass` (→ runProtocol) over chunkScopes
// and writes the OLD GovernConvergenceRecord; it never references runEndGovern nor
// writeWholeFeatureConvergenceRecord. The pipeline's one-record / one-lift behavior is
// proven separately by reconcile-once.test.ts (one record, overwrite) and T070 (the
// gate reads that record); this test pins the CLI→pipeline wiring itself.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..'); // plugins/stack-control/src

/** Source with comments stripped, so an assertion fires on CODE, not a note. */
function source(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('030 T069 — the implement-mode CLI drives the end-govern pipeline (FR-024/026, SC-008)', () => {
  const govern = source('subcommands/govern.ts');

  it('drives the pipeline via runEndGovern (the single whole-feature audit path)', () => {
    expect(govern, 'govern.ts must call runEndGovern — the CLI drives the pipeline').toMatch(/runEndGovern\s*\(/);
  });

  it('persists the whole-feature convergence record the gate reads', () => {
    expect(
      govern,
      'govern.ts must persist the WholeFeatureConvergenceRecord the impl gate reads',
    ).toMatch(/writeWholeFeatureConvergenceRecord\s*\(/);
  });

  it('does NOT loop runProtocol per chunk (the one-lift-per-chunk balloon is gone)', () => {
    expect(
      govern,
      'the per-chunk runProtocol loop over chunkScopes must be gone (it lifted once per chunk)',
    ).not.toMatch(/for\s*\(\s*const\s+chunkScope\s+of\s+chunkScopes/);
  });
});
