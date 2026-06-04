/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/workplan-archive/archive-phases-cli-all.test.ts
 *
 * AUDIT-20260604-19 regression: the `archive-phases --all` bug
 * AUDIT-18 fixed lived in the CLI shim's hardcoded
 * `001-IN-PROGRESS` path — but the AUDIT-18 fix's tests exercised
 * the library resolver directly without invoking the CLI surface.
 * That misses the regression-lock contract; this file drives the
 * CLI entrypoint end-to-end against features in non-001-IN-PROGRESS
 * status dirs, asserting the `--all` flag locates the workplan
 * regardless of which status directory the feature lives in.
 *
 * The test runs the actual `cli.ts` dispatcher via `tsx` so the
 * subcommand wiring (`SUBCOMMANDS['archive-phases']` → CLI shim)
 * + the `--all` branch's `resolveFeatureWorkplanPath` call are
 * both exercised. Pre-AUDIT-18-fix, the CLI's hardcoded path would
 * make these tests fail with `ENOENT` on the workplan read; post-
 * fix, they pass.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/workplan-archive/ -> src/cli.ts is ../../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', '..', 'cli.ts');

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

// tsx resolves TypeScript imports relative to its CWD, so we anchor
// the subprocess at the plugin's TS root (the parent of `src/cli.ts`).
// The fixture project's repo root is passed via `--repo-root`.
const PLUGIN_TSX_CWD = resolve(HERE, '..', '..', '..');

function runArchivePhasesCli(args: readonly string[]): CliResult {
  const result = spawnSync('tsx', [CLI_ENTRY, 'archive-phases', ...args], {
    cwd: PLUGIN_TSX_CWD,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  };
}

const ALL_CHECKED_WORKPLAN = `# Demo workplan

<!-- workplan-archive-ledger -->

## Phase 1: First

- [x] Step 1
- [x] Step 2

## Phase 2: Second

- [x] Step 1
- [x] Step 2
`;

function fixtureRepo(label: string): string {
  return mkdtempSync(join(tmpdir(), `audit-19-${label}-`));
}

function plantFeature(
  repoRoot: string,
  statusDir: '001-IN-PROGRESS' | '002-WAITING' | '003-COMPLETE',
  slug: string,
  workplan: string,
): string {
  const featureDir = join(repoRoot, 'docs', '1.0', statusDir, slug);
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'workplan.md'), workplan, 'utf8');
  return featureDir;
}

describe('archive-phases --all CLI surface — three-status resolver (AUDIT-20260604-19)', () => {
  it('AUDIT-19 bug-repro: --all locates feature in 003-COMPLETE end-to-end through the CLI (would FAIL pre-AUDIT-18-fix CLI shim)', () => {
    const root = fixtureRepo('cli-complete');
    plantFeature(root, '003-COMPLETE', 'demo', ALL_CHECKED_WORKPLAN);
    const result = runArchivePhasesCli([
      '--feature',
      'demo',
      '--all',
      '--repo-root',
      root,
    ]);
    expect(
      result.code,
      `--all should locate the workplan in 003-COMPLETE; stdout=${result.stdout}; stderr=${result.stderr}`,
    ).toBe(0);
    // The CLI prints which phases were expanded; that line proves the
    // CLI traversed the resolver successfully.
    expect(result.stderr).toContain('expanded to phases 1, 2');
  });

  it('regression-lock: --all locates feature in 002-WAITING end-to-end through the CLI', () => {
    const root = fixtureRepo('cli-waiting');
    plantFeature(root, '002-WAITING', 'demo', ALL_CHECKED_WORKPLAN);
    const result = runArchivePhasesCli([
      '--feature',
      'demo',
      '--all',
      '--repo-root',
      root,
    ]);
    expect(
      result.code,
      `--all should locate the workplan in 002-WAITING; stderr=${result.stderr}`,
    ).toBe(0);
    expect(result.stderr).toContain('expanded to phases 1, 2');
  });

  it('regression-lock: --all locates feature in 001-IN-PROGRESS end-to-end through the CLI (the case the hardcoded path WAS handling)', () => {
    const root = fixtureRepo('cli-in-progress');
    plantFeature(root, '001-IN-PROGRESS', 'demo', ALL_CHECKED_WORKPLAN);
    const result = runArchivePhasesCli([
      '--feature',
      'demo',
      '--all',
      '--repo-root',
      root,
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('expanded to phases 1, 2');
  });

  it('--all fails with exit 2 when feature slug exists in NO status dir (regression-lock against silent fallback)', () => {
    const root = fixtureRepo('cli-missing');
    // No feature dir planted.
    const result = runArchivePhasesCli([
      '--feature',
      'nonexistent-slug',
      '--all',
      '--repo-root',
      root,
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/feature dir not found for slug "nonexistent-slug"/);
  });
});
