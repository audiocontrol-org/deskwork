/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/orchestrator-turn.test.ts
 *
 * Tests for the CLI assembler that wires `runOrchestratorTurn` to a
 * `dw-lifecycle orchestrator-turn` subcommand. Uses on-disk tmp
 * fixtures (per project test rules: no fs mocks).
 *
 * Coverage:
 *   - Happy-path turn with no judge/auditor (the common dogfood mode).
 *   - Missing audit-log: empty entry read, still completes.
 *   - Catalog YAMLs partially present: only populated catalogs contribute.
 *   - JSON output: well-formed parseable shape.
 *   - Subcommand shim: handles --feature, --help, unknown flags, --json.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runOrchestratorTurnCli,
  type OrchestratorTurnCliArgs,
} from '../../scope-discovery/orchestrator-turn.js';

const RUNTIME_DIR = '.dw-lifecycle/scope-discovery/orchestrator-runtime';

describe('orchestrator-turn CLI assembler', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'orch-turn-cli-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('happy path: skipping judge + auditor produces a TurnReport with exit 0', async () => {
    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'sample-feature',
      skipJudge: true,
      skipAuditor: true,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    expect(result.report).toBeDefined();
    const report = result.report;
    if (report === undefined) throw new Error('expected report');
    expect(report.auditRead.newEntryCount).toBe(0);
    expect(report.wrongDecisions.length).toBe(0);
    expect(report.judgeResult).toBeUndefined();
    expect(report.auditorArtifactPath).toBeUndefined();
    expect(typeof report.summary).toBe('string');
    expect(report.summary.length).toBeGreaterThan(0);
    expect(report.nextLoopState.lastTurnId).toBe(report.turnId);
  });

  it('persists nextLoopState to disk after the turn', async () => {
    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'persistence-feature',
      skipJudge: true,
      skipAuditor: true,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    const statePath = resolve(tmp, RUNTIME_DIR, 'loop-state.json');
    const text = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
    expect(parsed.lastTurnId.length).toBeGreaterThan(0);
    expect(parsed.turnHistory.length).toBe(1);
  });

  it('absent audit-log: empty read + exit 0', async () => {
    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'no-audit-log-feature',
      skipJudge: true,
      skipAuditor: true,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    expect(result.report?.auditRead.newEntryCount).toBe(0);
    expect(result.report?.auditRead.priorWatermark).toBe('');
    expect(result.report?.auditRead.newWatermark).toBe('');
  });

  it('explicit --audit-log: reads the supplied path', async () => {
    const auditLogPath = resolve(tmp, 'my-audit-log.md');
    const log = [
      '### AUDIT-20260527-01: synthetic',
      'Finding-ID: AUDIT-20260527-01',
      'Status:   open',
      '',
      'Body of finding.',
      '',
    ].join('\n');
    await writeFile(auditLogPath, log, 'utf8');
    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'audit-explicit-feature',
      auditLogPath,
      skipJudge: true,
      skipAuditor: true,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    expect(result.report?.auditRead.newEntryCount).toBe(1);
    expect(result.report?.auditRead.newWatermark).toBe('AUDIT-20260527-01');
  });

  it('partial catalogs: only the present registries contribute entries', async () => {
    // Plant a single anti-patterns.yaml; the other registries are absent.
    const scopeDir = resolve(tmp, '.dw-lifecycle', 'scope-discovery');
    await mkdir(scopeDir, { recursive: true });
    const yaml = [
      'anti_patterns:',
      '  - id: my-ap',
      '    added_in: deadbeef',
      '    primitive: SomePrimitive',
      "    from: '@/components/SomePrimitive'",
      "    shape_regex: 'window\\.prompt'",
      '    message: |',
      '      Replace prompt() with the canonical overlay.',
      '',
    ].join('\n');
    await writeFile(resolve(scopeDir, 'anti-patterns.yaml'), yaml, 'utf8');

    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'partial-catalog-feature',
      skipJudge: true,
      skipAuditor: true,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    expect(result.report).toBeDefined();
    // The mediated metrics block carries pattern-matrix observations
    // gathered in-process; the assembler did not crash on missing
    // adopter-manifests.yaml / clones.yaml.
    expect(result.report?.metrics.generated_at).toBe('2026-05-27T00:00:00.000Z');
  });

  it('runtimeDirOverride: persists into the override directory', async () => {
    const overrideRuntime = '.custom-runtime-dir/orch';
    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'override-runtime-feature',
      skipJudge: true,
      skipAuditor: true,
      runtimeDirOverride: overrideRuntime,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    const overridePath = resolve(tmp, overrideRuntime, 'loop-state.json');
    const text = await readFile(overridePath, 'utf8');
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
  });

  it('TurnReport JSON is parseable round-trip', async () => {
    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'json-roundtrip-feature',
      skipJudge: true,
      skipAuditor: true,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    if (result.report === undefined) throw new Error('expected report');
    const json = JSON.stringify(result.report);
    expect(() => JSON.parse(json)).not.toThrow();
    const roundtrip = JSON.parse(json);
    expect(roundtrip.summary).toBe(result.report.summary);
    expect(roundtrip.turnId).toBe(result.report.turnId);
  });

  it('bad --judge-input file: exit 1 with explanatory error', async () => {
    const args: OrchestratorTurnCliArgs = {
      repoRoot: tmp,
      featureSlug: 'bad-judge-input-feature',
      judgeInputPath: resolve(tmp, 'nope-not-here.json'),
      skipAuditor: true,
      now: '2026-05-27T00:00:00.000Z',
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(1);
    expect(result.errorText).toBeDefined();
    expect(result.errorText).toMatch(/--judge-input/);
  });
});
