// 030 US8 (T061/T062) — the targeted-refactor verification. The broken
// exclusion-based whole-feature composition path is GONE (the bug class —
// empty diffScope.files, unscoped commit subjects, ignored checkpoint env, the
// dead re-audit branch — no longer reproduces because the composition arm is
// deleted), and every NEW source file the feature introduces is within the
// 300–500-line cap (SC-007, FR-022, Principle VI).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const NEW_030_FILES = [
  'govern/chunk-artifacts.ts',
  'govern/chunk-manifest.ts',
  'govern/touched-set.ts',
  'govern/seam-pass.ts',
  'govern/payload-chunk.ts',
  'govern/payload-diff-scope.ts',
  'govern/end-govern-pipeline.ts',
  'govern/cluster-payload/coupling-graph.ts',
  'govern/cluster-payload/clustering.ts',
  'govern/cluster-payload/non-audit-trim.ts',
  'govern/cluster-payload/envelope-binpack.ts',
  'govern/cluster-payload/chunk-id.ts',
  'govern/cluster-payload/partition.ts',
  'govern/fix-fanout/worktree-dispatch.ts',
  'govern/fix-fanout/merge-serialize.ts',
  'scope-discovery/doctor-rules/chunked-govern-artifacts.ts',
];

describe('030 US8 — composition bugs gone (T061)', () => {
  it('the exclusion-based composition surface is deleted from govern.ts (FR-023)', () => {
    const govern = readFileSync(join(SRC, 'subcommands/govern.ts'), 'utf8');
    expect(govern).not.toContain('compositionExcludePaths');
    expect(govern).not.toContain('carriedFilesForComposition');
    // The inclusion-based committed-diff scoping replaces it.
    expect(govern).toContain('scopeCommittedDiff');
    expect(govern).toContain('partitionDiff');
  });
});

describe('030 US8 — new modules within the line cap (T062, SC-007)', () => {
  it('every new 030 source file is ≤ 500 lines', () => {
    for (const rel of NEW_030_FILES) {
      const lines = readFileSync(join(SRC, rel), 'utf8').split('\n').length;
      expect(lines, `${rel} is ${lines} lines (cap 500)`).toBeLessThanOrEqual(500);
    }
  });

  it('the new cluster-payload + fix-fanout directories contain only ≤500-line modules', () => {
    for (const dir of ['govern/cluster-payload', 'govern/fix-fanout']) {
      for (const f of readdirSync(join(SRC, dir))) {
        if (!f.endsWith('.ts')) continue;
        const p = join(SRC, dir, f);
        if (statSync(p).isFile()) {
          const lines = readFileSync(p, 'utf8').split('\n').length;
          expect(lines, `${dir}/${f} is ${lines} lines`).toBeLessThanOrEqual(500);
        }
      }
    }
  });
});
