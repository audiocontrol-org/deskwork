/**
 * Phase 14 Task 1 — quiet the orchestrator-turn 3/6 catalog NOTE on
 * unchanged steady-state turns.
 *
 * Closes AUDIT-20260529-12.
 *
 * Behavior contract:
 *   - First turn (no prior loop-state OR loop-state without
 *     `catalogPresentCount`): NOTE emitted when 0 < presentCount < 6.
 *   - Subsequent turn with the SAME presentCount as prior: NOTE
 *     suppressed (the steady-state noise the TF flagged).
 *   - Subsequent turn with a DIFFERENT presentCount (file added or
 *     removed): NOTE re-emitted (the change IS the signal).
 *   - `--verbose` (`verbose: true` in CLI args): NOTE emitted regardless
 *     of prior state.
 *   - presentCount === 0 → WARNING always emitted (unchanged behavior;
 *     not subject to noise gating).
 *   - presentCount === totalCount → neither WARNING nor NOTE (unchanged).
 *
 * Tests drive `runOrchestratorTurnCli` against tmpdir fixtures with on-
 * disk catalog files; sequential turns in the same tmp share loop state
 * via `.dw-lifecycle/scope-discovery/orchestrator-runtime/...`.
 */

import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runOrchestratorTurnCli,
  type OrchestratorTurnCliArgs,
} from '../../../scope-discovery/orchestrator-turn.js';

const RUNTIME_DIR = '.dw-lifecycle/scope-discovery/orchestrator-runtime';

// Minimal valid YAML bodies — the catalog loaders parse these for real
// (not just existsSync), so a placeholder body would fail downstream
// catalog parsing. Mirrors the fixture used by the existing
// orchestrator-turn.test.ts "full catalog" scenario.
const MINIMAL_PATTERN_BODY = [
  'patterns:',
  '  - id: tf6-test-pattern',
  '    type: regex',
  '    status: blessed',
  '    surface: code',
  "    target: 'src/**/*.ts'",
  "    regex: 'window\\\\.alert\\('",
  '    description: TF-006 fixture',
  '',
].join('\n');

const CATALOG_BODIES: Record<string, string> = {
  'anti-patterns.yaml': 'anti_patterns: []\n',
  'adopter-manifests.yaml': 'adopter_manifests: []\n',
  'editor-symmetry-matrix.yaml': 'placeholder: true\n',
  'deprecations.yaml': 'placeholder: true\n',
  'pattern-matrix-patterns.yaml': MINIMAL_PATTERN_BODY,
  'clones.yaml': 'generated_at: 2026-05-27T00:00:00.000Z\nclones: []\n',
};

async function writeYaml(scopeDir: string, name: string, body: string): Promise<void> {
  await writeFile(resolve(scopeDir, name), body, 'utf8');
}

async function setupScopeDir(repoRoot: string, files: ReadonlyArray<string>): Promise<string> {
  const scopeDir = resolve(repoRoot, '.dw-lifecycle', 'scope-discovery');
  await mkdir(scopeDir, { recursive: true });
  for (const name of files) {
    const body = CATALOG_BODIES[name];
    if (body === undefined) {
      throw new Error(`fixture body missing for catalog: ${name}`);
    }
    await writeYaml(scopeDir, name, body);
  }
  return scopeDir;
}

function baseArgs(repoRoot: string, slug: string, now: string): OrchestratorTurnCliArgs {
  return {
    repoRoot,
    featureSlug: slug,
    skipJudge: true,
    skipAuditor: true,
    now,
    allowMissingFeature: true,
  };
}

describe('Phase 14 Task 1 — catalog NOTE noise gating', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'note-noise-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('first turn with 3/6 catalogs → NOTE emitted (no prior state)', async () => {
    await setupScopeDir(tmp, [
      'anti-patterns.yaml',
      'adopter-manifests.yaml',
      'clones.yaml',
    ]);

    const result = await runOrchestratorTurnCli(
      baseArgs(tmp, 'first-turn', '2026-05-27T00:00:00.000Z'),
    );

    expect(result.exitCode).toBe(0);
    expect(result.report?.summary).toMatch(/^NOTE: only 3\/6 catalog/);
  });

  it('second turn with SAME 3/6 count → NOTE suppressed (steady state)', async () => {
    await setupScopeDir(tmp, [
      'anti-patterns.yaml',
      'adopter-manifests.yaml',
      'clones.yaml',
    ]);

    const first = await runOrchestratorTurnCli(
      baseArgs(tmp, 'steady-state', '2026-05-27T00:00:00.000Z'),
    );
    expect(first.exitCode).toBe(0);
    expect(first.report?.summary).toMatch(/^NOTE: only 3\/6 catalog/);

    const second = await runOrchestratorTurnCli(
      baseArgs(tmp, 'steady-state', '2026-05-27T00:05:00.000Z'),
    );
    expect(second.exitCode).toBe(0);
    expect(second.report?.summary).not.toMatch(/^NOTE: only/);
    expect(second.report?.summary).not.toMatch(/^WARNING:/);
  });

  it('count CHANGES between turns (file added) → NOTE re-emitted', async () => {
    const scopeDir = await setupScopeDir(tmp, [
      'anti-patterns.yaml',
      'adopter-manifests.yaml',
      'clones.yaml',
    ]);

    const first = await runOrchestratorTurnCli(
      baseArgs(tmp, 'changes', '2026-05-27T00:00:00.000Z'),
    );
    expect(first.report?.summary).toMatch(/^NOTE: only 3\/6 catalog/);

    // Second turn at the same count — should suppress.
    const second = await runOrchestratorTurnCli(
      baseArgs(tmp, 'changes', '2026-05-27T00:05:00.000Z'),
    );
    expect(second.report?.summary).not.toMatch(/^NOTE: only/);

    // Operator adds a new catalog. Count rises 3 → 4.
    await writeYaml(scopeDir, 'deprecations.yaml', 'placeholder: true\n');

    const third = await runOrchestratorTurnCli(
      baseArgs(tmp, 'changes', '2026-05-27T00:10:00.000Z'),
    );
    expect(third.report?.summary).toMatch(/^NOTE: only 4\/6 catalog/);
  });

  it('count CHANGES between turns (file removed) → NOTE re-emitted', async () => {
    const scopeDir = await setupScopeDir(tmp, [
      'anti-patterns.yaml',
      'adopter-manifests.yaml',
      'clones.yaml',
      'deprecations.yaml',
    ]);

    const first = await runOrchestratorTurnCli(
      baseArgs(tmp, 'removal', '2026-05-27T00:00:00.000Z'),
    );
    expect(first.report?.summary).toMatch(/^NOTE: only 4\/6 catalog/);

    // Remove a catalog. Count drops 4 → 3.
    await unlink(resolve(scopeDir, 'deprecations.yaml'));

    const second = await runOrchestratorTurnCli(
      baseArgs(tmp, 'removal', '2026-05-27T00:05:00.000Z'),
    );
    expect(second.report?.summary).toMatch(/^NOTE: only 3\/6 catalog/);
  });

  it('verbose=true → NOTE emitted on unchanged steady-state turn', async () => {
    await setupScopeDir(tmp, [
      'anti-patterns.yaml',
      'adopter-manifests.yaml',
      'clones.yaml',
    ]);

    const first = await runOrchestratorTurnCli(
      baseArgs(tmp, 'verbose-feat', '2026-05-27T00:00:00.000Z'),
    );
    expect(first.report?.summary).toMatch(/^NOTE: only 3\/6 catalog/);

    const second = await runOrchestratorTurnCli({
      ...baseArgs(tmp, 'verbose-feat', '2026-05-27T00:05:00.000Z'),
      verbose: true,
    });
    expect(second.report?.summary).toMatch(/^NOTE: only 3\/6 catalog/);
  });

  it('zero catalogs always emits WARNING (not gated)', async () => {
    // No scope-discovery dir at all.
    const first = await runOrchestratorTurnCli(
      baseArgs(tmp, 'no-cat', '2026-05-27T00:00:00.000Z'),
    );
    expect(first.report?.summary).toMatch(/^WARNING: no scope-discovery/);

    const second = await runOrchestratorTurnCli(
      baseArgs(tmp, 'no-cat', '2026-05-27T00:05:00.000Z'),
    );
    expect(second.report?.summary).toMatch(/^WARNING: no scope-discovery/);
  });

  it('full catalog (6/6) never emits NOTE on any turn', async () => {
    await setupScopeDir(tmp, [
      'anti-patterns.yaml',
      'adopter-manifests.yaml',
      'editor-symmetry-matrix.yaml',
      'deprecations.yaml',
      'pattern-matrix-patterns.yaml',
      'clones.yaml',
    ]);

    const first = await runOrchestratorTurnCli(
      baseArgs(tmp, 'full-cat', '2026-05-27T00:00:00.000Z'),
    );
    expect(first.report?.summary).not.toMatch(/^NOTE: only/);
    expect(first.report?.summary).not.toMatch(/^WARNING:/);

    const second = await runOrchestratorTurnCli(
      baseArgs(tmp, 'full-cat', '2026-05-27T00:05:00.000Z'),
    );
    expect(second.report?.summary).not.toMatch(/^NOTE: only/);
  });

  it('persists catalogPresentCount onto the new TurnHistoryEntry', async () => {
    await setupScopeDir(tmp, [
      'anti-patterns.yaml',
      'adopter-manifests.yaml',
      'clones.yaml',
    ]);

    await runOrchestratorTurnCli(
      baseArgs(tmp, 'persist-count', '2026-05-27T00:00:00.000Z'),
    );

    const statePath = resolve(
      tmp,
      RUNTIME_DIR,
      'persist-count',
      'loop-state.json',
    );
    const parsed: { turnHistory: ReadonlyArray<{ catalogPresentCount?: number }> } = JSON.parse(
      await readFile(statePath, 'utf8'),
    );
    expect(parsed.turnHistory[0]?.catalogPresentCount).toBe(3);
  });
});
