// specs/014 US3 (TASK-12 / gh-440): mechanism-aware finding clustering.
//
// The recorded defect: clusterFindings unions on
// `headingsAgree() || surfacesAgree()` — a shared repo-relative path
// token ALONE (surface agreement) unions findings transitively, and
// mergeCluster keeps a single representative heading/body. Five
// distinct-mechanism findings at one surface collapsed into one
// audit-log entry documenting only one mechanism; the other four became
// invisible and un-closeable.
//
// Contract under test (cli-contracts §audit-barrage-lift; research R3;
// data-model §Finding cluster): union requires heading agreement (the
// mechanism proxy); surface agreement alone never unions; cross-model
// annotation only on same-root-cause multi-model merges.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractBarrageFindings } from '../scope-discovery/promote-findings/extract-barrage-findings.js';

function findingBlock(
  id: string,
  heading: string,
  surface: string,
  body: string,
): string {
  return [
    `### ${heading}`,
    '',
    `Finding-ID: ${id}`,
    'Status:     open',
    'Severity:   high',
    `Surface:    ${surface}`,
    '',
    body,
    '',
  ].join('\n');
}

async function extractFromModels(
  modelFiles: Record<string, string>,
): Promise<Awaited<ReturnType<typeof extractBarrageFindings>>> {
  const runDir = mkdtempSync(join(tmpdir(), 'lift-cluster-'));
  try {
    for (const [name, content] of Object.entries(modelFiles)) {
      writeFileSync(join(runDir, name), content, 'utf8');
    }
    return await extractBarrageFindings({ runDir, warn: () => {} });
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

// The recorded 5-into-1 collapse shape: two models, every finding names
// the SAME surface path token, five DISTINCT mechanisms (no 12-char
// normalized heading overlap between any pair).
const SHARED_SURFACE = 'src/subcommands/slush-findings.ts:171';
const FIVE_MECHANISMS: ReadonlyArray<{ id: string; heading: string; body: string }> = [
  {
    id: 'AUDIT-BARRAGE-claude-01',
    heading: 'Quadratic walk re-reads every record',
    body: 'Mechanism one.',
  },
  {
    id: 'AUDIT-BARRAGE-claude-02',
    heading: 'Silent truncation past the page limit',
    body: 'Mechanism two.',
  },
  {
    id: 'AUDIT-BARRAGE-claude-03',
    heading: 'Unlocatable flip exits zero anyway',
    body: 'Mechanism three.',
  },
  {
    id: 'AUDIT-BARRAGE-codex-01',
    heading: 'Divergent keying between two passes',
    body: 'Mechanism four.',
  },
  {
    id: 'AUDIT-BARRAGE-codex-02',
    heading: 'Stale apply misses hand-edited rows',
    body: 'Mechanism five.',
  },
];

describe('US3 — mechanism-aware clustering (surface agreement alone never merges)', () => {
  it('the recorded collapse: five distinct mechanisms at one surface yield FIVE entries', async () => {
    const claude = FIVE_MECHANISMS.filter((f) => f.id.includes('claude'))
      .map((f) => findingBlock(f.id, f.heading, SHARED_SURFACE, f.body))
      .join('\n');
    const codex = FIVE_MECHANISMS.filter((f) => f.id.includes('codex'))
      .map((f) => findingBlock(f.id, f.heading, SHARED_SURFACE, f.body))
      .join('\n');
    const entries = await extractFromModels({
      'claude.md': claude,
      'codex.md': codex,
    });

    expect(entries).toHaveLength(5);
    // Every mechanism's heading survives as its own independently-closeable entry.
    const headings = entries.map((e) => e.heading).sort();
    expect(headings).toEqual(FIVE_MECHANISMS.map((f) => f.heading).sort());
    // None of these is a cross-model merge — surface adjacency is not agreement.
    for (const entry of entries) {
      expect(entry.crossModelAgreement).toBe(false);
      expect(entry.sourceFindingIds).toHaveLength(1);
    }
  });

  it('a same-root-cause pair (12+ char heading overlap) still merges with cross-model annotation', async () => {
    const entries = await extractFromModels({
      'claude.md': findingBlock(
        'AUDIT-BARRAGE-claude-01',
        'exists() re-parses every task file on each call',
        'src/backlog/backend.ts:121',
        'Claude wording.',
      ),
      'codex.md': findingBlock(
        'AUDIT-BARRAGE-codex-01',
        'Quadratic: exists() re-parses every task file',
        'src/backlog/backend.ts:130',
        'Codex wording.',
      ),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.crossModelAgreement).toBe(true);
    expect([...(entries[0]?.sourceModels ?? [])].sort()).toEqual(['claude', 'codex']);
    expect(entries[0]?.sourceFindingIds).toHaveLength(2);
  });

  it('partial-overlap chain A+B(X) / B+C(Y) yields TWO entries, not one transitive blob (spec US3 edge)', async () => {
    const surface = 'src/govern/payload-implement.ts:131';
    const headingX = 'Untracked fold sweeps unrelated feature scaffolds';
    const headingY = 'Committed diff carries the audit-log lift commits';
    const entries = await extractFromModels({
      'model-a.md': findingBlock('AUDIT-BARRAGE-a-01', headingX, surface, 'A on X.'),
      'model-b.md': [
        findingBlock('AUDIT-BARRAGE-b-01', headingX, surface, 'B on X.'),
        findingBlock('AUDIT-BARRAGE-b-02', headingY, surface, 'B on Y.'),
      ].join('\n'),
      'model-c.md': findingBlock('AUDIT-BARRAGE-c-01', headingY, surface, 'C on Y.'),
    });

    expect(entries).toHaveLength(2);
    const byHeading = new Map(entries.map((e) => [e.heading, e]));
    const x = byHeading.get(headingX);
    const y = byHeading.get(headingY);
    expect(x).toBeDefined();
    expect(y).toBeDefined();
    expect(x?.crossModelAgreement).toBe(true);
    expect([...(x?.sourceModels ?? [])].sort()).toEqual(['model-a', 'model-b']);
    expect(y?.crossModelAgreement).toBe(true);
    expect([...(y?.sourceModels ?? [])].sort()).toEqual(['model-b', 'model-c']);
  });
});
