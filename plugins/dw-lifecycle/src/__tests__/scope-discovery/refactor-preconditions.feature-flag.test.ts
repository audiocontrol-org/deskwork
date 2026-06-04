/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/refactor-preconditions.feature-flag.test.ts
 *
 * Phase 18 Task 6 — TDD-first tests for `check-refactor-preconditions
 * --feature <slug>`.
 *
 * Refs #417.
 *
 * Cases:
 *   (a) `--feature hygiene` validates ONLY clone IDs whose group has
 *       ≥1 member in feature-scope; the other IDs are silently dropped
 *       from the gate's checking surface.
 *   (b) no `--feature` flag preserves current behavior (every named ID
 *       is validated).
 *   (c) clone-id whose group has zero in-scope members → silently
 *       skipped (no error reported about it).
 *   (d) `--feature unknown-slug` (via main CLI) → exits 2 with
 *       FeatureNotFoundError.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import {
  main,
  runGate,
  type Cli,
} from '../../scope-discovery/check-refactor-preconditions.js';

const ID_IN = 'a1a1a1a1a1a1';
const ID_OUT = 'b2b2b2b2b2b2';
const MISSING_CANONICAL = 'src/scope-discovery/this-file-does-not-exist.ts';
const FAKE_SHA = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

function buildBadCloneEntry(id: string, member: string): string {
  // Refactor disposition with deliberately-bad preconditions so the
  // gate WOULD report errors if it checks this entry.
  return [
    `  - id: ${id}`,
    `    lines: 7`,
    `    members:`,
    `      - ${member}:1:7`,
    `      - ${member.replace('.ts', '-b.ts')}:1:7`,
    `    disposition: refactor`,
    `    reason: null`,
    `    canonical_side: ${JSON.stringify(MISSING_CANONICAL)}`,
    `    canonical_reason: synthetic`,
    `    tests:`,
    `      - "true"`,
    `    tests_proof:`,
    `      sha: ${JSON.stringify(FAKE_SHA)}`,
    `      demonstration: synthetic`,
  ].join('\n');
}

async function plantManifest(
  fixtureDir: string,
  inScopeFiles: readonly string[],
): Promise<void> {
  const featureDir = join(fixtureDir, 'docs', '1.0', '001-IN-PROGRESS', 'hygiene');
  await mkdir(featureDir, { recursive: true });
  const entries = inScopeFiles
    .map(
      (file, idx) =>
        `    - id: scope-${idx}\n      file: ${file}\n      shape: holdout\n      replacement: fix\n      evidence:\n        registry_path: x.yaml\n        registry_id: scope-${idx}\n      status_provenance:\n        source_status: blessed\n        provenance_source: install-seed`,
    )
    .join('\n');
  const body = [
    'kind: code',
    'feature_slug: hygiene',
    'generated_by: curated',
    'generated_at: 2026-06-04T00:00:00.000Z',
    'scenarios:',
    '  - id: default',
    '    label: Default',
    '    description: stub',
    'reference_docs:',
    '  - path: docs/1.0/001-IN-PROGRESS/hygiene/prd.md',
    '    role: prd',
    '    summary: PRD',
    'discovery_themes:',
    '  - hygiene',
    'modules: []',
    'regime_holdouts:',
    '  anti_patterns: []',
    '  adopter_manifests: []',
    '  module_symmetry: []',
    '  deprecations:',
    entries,
    '  meta:',
    `    total: ${inScopeFiles.length}`,
    '    by_source:',
    '      anti_patterns: 0',
    '      adopter_manifests: 0',
    '      module_symmetry: 0',
    `      deprecations: ${inScopeFiles.length}`,
    '',
  ].join('\n');
  await writeFile(join(featureDir, 'scope-manifest.yaml'), body, 'utf8');
}

async function setupFixture(): Promise<{ dir: string; baselinePath: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'refactor-precond-feat-'));
  const baselinePath = join(dir, 'clones.yaml');
  return {
    dir,
    baselinePath,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe('check-refactor-preconditions --feature <slug>', () => {
  it('(b) no --feature flag validates every marked ID (baseline preserved)', async () => {
    const fixture = await setupFixture();
    try {
      const yaml = [
        `generated_at: 2026-06-04T00:00:00Z`,
        `clones:`,
        buildBadCloneEntry(ID_IN, 'in-scope/x.ts'),
        buildBadCloneEntry(ID_OUT, 'out-of-scope/y.ts'),
      ].join('\n') + '\n';
      await writeFile(fixture.baselinePath, yaml, 'utf8');
      const cli: Cli = {
        commitMsgFile: null,
        commitMsgInline: `refactor: foo\n\nCloses clones.yaml ${ID_IN}, ${ID_OUT}\n`,
        baselinePath: fixture.baselinePath,
        repoRoot: fixture.dir,
        testTimeoutSeconds: 60,
        skipTestRun: true,
        gateMode: false,
        feature: null,
      };
      const result = await runGate(cli, cli.commitMsgInline!);
      expect(result.markedIds).toEqual([ID_IN, ID_OUT]);
      // Both groups have bad preconditions → both should report errors.
      const erroredIds = new Set(result.errors.map((e) => e.cloneId));
      expect(erroredIds.has(ID_IN)).toBe(true);
      expect(erroredIds.has(ID_OUT)).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('(a)+(c) --feature hygiene validates only in-scope IDs; out-of-scope silently skipped', async () => {
    const fixture = await setupFixture();
    try {
      const yaml = [
        `generated_at: 2026-06-04T00:00:00Z`,
        `clones:`,
        buildBadCloneEntry(ID_IN, 'in-scope/x.ts'),
        buildBadCloneEntry(ID_OUT, 'out-of-scope/y.ts'),
      ].join('\n') + '\n';
      await writeFile(fixture.baselinePath, yaml, 'utf8');
      // Scope manifest points at in-scope/x.ts only.
      await plantManifest(fixture.dir, ['in-scope/x.ts']);
      const cli: Cli = {
        commitMsgFile: null,
        commitMsgInline: `refactor: foo\n\nCloses clones.yaml ${ID_IN}, ${ID_OUT}\n`,
        baselinePath: fixture.baselinePath,
        repoRoot: fixture.dir,
        testTimeoutSeconds: 60,
        skipTestRun: true,
        gateMode: false,
        feature: 'hygiene',
      };
      const result = await runGate(cli, cli.commitMsgInline!);
      // Both marker IDs still parsed (they DO appear in the message).
      expect(result.markedIds).toEqual([ID_IN, ID_OUT]);
      // BUT only ID_IN's preconditions get checked → ID_OUT silently dropped.
      const erroredIds = new Set(result.errors.map((e) => e.cloneId));
      expect(erroredIds.has(ID_IN)).toBe(true);
      expect(
        erroredIds.has(ID_OUT),
        `ID_OUT should be silently skipped when --feature narrows scope to in-scope/x.ts only; errors=${JSON.stringify(result.errors)}`,
      ).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('(d) --feature unknown-slug → main() exits 2 with FeatureNotFoundError', async () => {
    const fixture = await setupFixture();
    try {
      const yaml = [
        `generated_at: 2026-06-04T00:00:00Z`,
        `clones:`,
        buildBadCloneEntry(ID_IN, 'in-scope/x.ts'),
      ].join('\n') + '\n';
      await writeFile(fixture.baselinePath, yaml, 'utf8');
      const origCwd = process.cwd();
      const origErr = process.stderr.write.bind(process.stderr);
      const stderrChunks: string[] = [];
      try {
        process.chdir(fixture.dir);
        process.stderr.write = ((chunk: string) => {
          stderrChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
          return true;
        }) as typeof process.stderr.write;
        const code = await main([
          '--commit-msg',
          `refactor: foo\n\nCloses clones.yaml ${ID_IN}\n`,
          '--baseline',
          fixture.baselinePath,
          '--feature',
          'does-not-exist',
          '--skip-test-run',
        ]);
        expect(code).toBe(2);
        expect(stderrChunks.join('')).toMatch(/feature 'does-not-exist' not found/);
      } finally {
        process.stderr.write = origErr;
        process.chdir(origCwd);
      }
    } finally {
      await fixture.cleanup();
    }
  });
});
