// 030 T059 (RED first) — FR-021 / SC-006 / US7: the doctor rule flags a malformed
// whole-feature convergence record, a missing required field on a new artifact,
// and a split-cluster marker referencing a non-existent chunk (dangling ref) with
// actionable messages. Watched to FAIL while the rule is absent (T060 adds it).

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../../scope-discovery/doctor-rules/chunked-govern-artifacts.js';

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), 'cga-doctor-'));
  mkdirSync(join(root, '.stack-control', 'govern', 'convergence'), { recursive: true });
  mkdirSync(join(root, '.stack-control', 'govern', 'chunk-sets'), { recursive: true });
  return root;
}

describe('030 T059 — chunked-govern-artifacts doctor rule (FR-021, SC-006)', () => {
  it('flags a malformed whole-feature convergence record (missing required field)', async () => {
    const root = setup();
    try {
      // valid except `outcome` is missing
      writeFileSync(
        join(root, '.stack-control', 'govern', 'convergence', 'impl__multi-feature-x.json'),
        JSON.stringify({ version: 1, mode: 'impl', item: 'multi:feature/x', governedShaBase: 'b', headSha: 'h', chunkIds: [], rounds: 1, liftedFindings: [], closedInLoopFindings: [], seamResult: { boundaryPairs: [], findings: [], suppressedCompatible: 0 }, splitClusterRefs: [], anchorRoot: root }),
      );
      const findings = await check({ repoRoot: root });
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.severity === 'error' && /outcome/.test(f.message))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a split-cluster marker referencing a non-existent chunk (dangling ref)', async () => {
    const root = setup();
    try {
      writeFileSync(
        join(root, '.stack-control', 'govern', 'chunk-sets', 'impl__feat.json'),
        JSON.stringify({
          chunks: [{ id: 'c1', files: ['a.ts'], splitCluster: true, renderedBytes: 10 }],
          splitClusterMarkers: [{ clusterId: 'cl1', subChunkIds: ['c1', 'c999'], trimApplied: [], coverageCaveat: 'x' }],
        }),
      );
      const findings = await check({ repoRoot: root });
      expect(findings.some((f) => /c999/.test(f.message) && /dangling/i.test(f.message))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // TASK-437 — a persisted chunk-set must list the chunks it governed. end-govern
  // FATALs on an empty scope BEFORE writing a record, so a chunk-set artifact with a
  // missing / empty / non-array `chunks` field is corrupt, not "valid with zero chunks".
  it('TASK-437 flags a chunk-set artifact MISSING its chunks field', async () => {
    const root = setup();
    try {
      writeFileSync(
        join(root, '.stack-control', 'govern', 'chunk-sets', 'impl__nofield.json'),
        JSON.stringify({ splitClusterMarkers: [] }),
      );
      const findings = await check({ repoRoot: root });
      expect(findings.some((f) => f.severity === 'error' && /chunks/.test(f.message))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('TASK-437 flags a chunk-set artifact with an EMPTY chunks array', async () => {
    const root = setup();
    try {
      writeFileSync(
        join(root, '.stack-control', 'govern', 'chunk-sets', 'impl__empty.json'),
        JSON.stringify({ chunks: [], splitClusterMarkers: [] }),
      );
      const findings = await check({ repoRoot: root });
      expect(findings.some((f) => f.severity === 'error' && /empty/i.test(f.message))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('TASK-437 flags a chunk-set artifact whose chunks field is not an array', async () => {
    const root = setup();
    try {
      writeFileSync(
        join(root, '.stack-control', 'govern', 'chunk-sets', 'impl__nonarray.json'),
        JSON.stringify({ chunks: { id: 'c1' }, splitClusterMarkers: [] }),
      );
      const findings = await check({ repoRoot: root });
      expect(findings.some((f) => f.severity === 'error' && /chunks/.test(f.message))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports nothing for a clean installation (no artifacts)', async () => {
    const root = setup();
    try {
      expect(await check({ repoRoot: root })).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
