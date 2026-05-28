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
import { parseFlags } from '../../subcommands/orchestrator-turn.js';

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
      allowMissingFeature: true,
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
      allowMissingFeature: true,
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    const statePath = resolve(tmp, RUNTIME_DIR, 'persistence-feature', 'loop-state.json');
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
      allowMissingFeature: true,
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
      allowMissingFeature: true,
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
      allowMissingFeature: true,
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
      allowMissingFeature: true,
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(0);
    const overridePath = resolve(tmp, overrideRuntime, 'override-runtime-feature', 'loop-state.json');
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
      allowMissingFeature: true,
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
      allowMissingFeature: true,
    };
    const result = await runOrchestratorTurnCli(args);
    expect(result.exitCode).toBe(1);
    expect(result.errorText).toBeDefined();
    expect(result.errorText).toMatch(/--judge-input/);
  });
  describe('TF-005 — feature-existence pre-flight', () => {
    it('exits 2 when feature directory does not exist', async () => {
      await mkdir(resolve(tmp, 'docs', '1.0', '001-IN-PROGRESS', 'real-feature-1'), { recursive: true });
      await mkdir(resolve(tmp, 'docs', '0.22.0', '001-IN-PROGRESS', 'old-feature'), { recursive: true });
      const args: OrchestratorTurnCliArgs = {
        repoRoot: tmp,
        featureSlug: 'does-not-exist',
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
      };
      const result = await runOrchestratorTurnCli(args);
      expect(result.exitCode).toBe(2);
      expect(result.errorText).toMatch(/feature 'does-not-exist' not found/);
      expect(result.errorText).toMatch(/old-feature/);
      expect(result.errorText).toMatch(/real-feature-1/);
    });

    it('exits 2 with <none found> when no in-progress features exist', async () => {
      const args: OrchestratorTurnCliArgs = {
        repoRoot: tmp,
        featureSlug: 'anything',
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
      };
      const result = await runOrchestratorTurnCli(args);
      expect(result.exitCode).toBe(2);
      expect(result.errorText).toMatch(/<none found>/);
    });

    it('--allow-missing-feature reverts to the old silent-no-op behavior', async () => {
      const args: OrchestratorTurnCliArgs = {
        repoRoot: tmp,
        featureSlug: 'does-not-exist',
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
        allowMissingFeature: true,
      };
      const result = await runOrchestratorTurnCli(args);
      expect(result.exitCode).toBe(0);
    });

    it('accepts a feature in a non-1.0 version dir', async () => {
      await mkdir(resolve(tmp, 'docs', '0.22.0', '001-IN-PROGRESS', 'legacy-feature'), { recursive: true });
      const args: OrchestratorTurnCliArgs = {
        repoRoot: tmp,
        featureSlug: 'legacy-feature',
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
      };
      const result = await runOrchestratorTurnCli(args);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('TF-006 — catalog-presence summary decoration', () => {
    it('zero catalogs present → summary prepends WARNING', async () => {
      const args: OrchestratorTurnCliArgs = {
        repoRoot: tmp,
        featureSlug: 'no-catalog-feature',
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
        allowMissingFeature: true,
      };
      const result = await runOrchestratorTurnCli(args);
      expect(result.exitCode).toBe(0);
      expect(result.report?.summary).toMatch(/^WARNING: no scope-discovery catalog/);
      expect(result.report?.summary).toMatch(/install-scope-discovery/);
    });

    it('partial catalog → summary prepends NOTE with count', async () => {
      const scopeDir = resolve(tmp, '.dw-lifecycle', 'scope-discovery');
      await mkdir(scopeDir, { recursive: true });
      await writeFile(resolve(scopeDir, 'anti-patterns.yaml'), 'anti_patterns: []\n', 'utf8');
      const args: OrchestratorTurnCliArgs = {
        repoRoot: tmp,
        featureSlug: 'partial-catalog-feature-2',
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
        allowMissingFeature: true,
      };
      const result = await runOrchestratorTurnCli(args);
      expect(result.exitCode).toBe(0);
      expect(result.report?.summary).toMatch(/^NOTE: only 1\/6 catalog/);
      expect(result.report?.summary).toMatch(/anti-patterns\.yaml/);
    });

    it('full catalog (all 6) → summary unchanged', async () => {
      const scopeDir = resolve(tmp, '.dw-lifecycle', 'scope-discovery');
      await mkdir(scopeDir, { recursive: true });
      const minimalPattern = [
        'patterns:',
        '  - id: tf6-test-pattern',
        '    type: regex',
        '    status: blessed',
        '    surface: code',
        '    target: \'src/**/*.ts\'',
        '    regex: \'window\\\\.alert\\(\'',
        '    description: TF-006 fixture',
        '',
      ].join('\n');
      const files: Array<[string, string]> = [
        ['anti-patterns.yaml', 'anti_patterns: []\n'],
        ['adopter-manifests.yaml', 'adopter_manifests: []\n'],
        ['editor-symmetry-matrix.yaml', 'placeholder: true\n'],
        ['deprecations.yaml', 'placeholder: true\n'],
        ['pattern-matrix-patterns.yaml', minimalPattern],
        ['clones.yaml', 'generated_at: 2026-05-27T00:00:00.000Z\nclones: []\n'],
      ];
      for (const [name, body] of files) {
        // eslint-disable-next-line no-await-in-loop
        await writeFile(resolve(scopeDir, name), body, 'utf8');
      }
      const args: OrchestratorTurnCliArgs = {
        repoRoot: tmp,
        featureSlug: 'full-catalog-feature',
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
        allowMissingFeature: true,
      };
      const result = await runOrchestratorTurnCli(args);
      expect(result.exitCode).toBe(0);
      expect(result.report?.summary).not.toMatch(/^WARNING:/);
      expect(result.report?.summary).not.toMatch(/^NOTE:/);
      expect(result.report?.summary).toMatch(/audit entr/);
    });
  });

  describe('TF-012 — per-feature state isolation', () => {
    it('two consecutive turns against different feature slugs do not share state', async () => {
      const logA = resolve(tmp, 'audit-log-a.md');
      const logB = resolve(tmp, 'audit-log-b.md');
      await writeFile(logA, '### AUDIT-A-20260527-01\nFinding-ID: AUDIT-A-20260527-01\nStatus:   open\n\nBody.\n', 'utf8');
      await writeFile(logB, '### AUDIT-B-20260527-99\nFinding-ID: AUDIT-B-20260527-99\nStatus:   open\n\nBody.\n', 'utf8');

      const turnA = await runOrchestratorTurnCli({
        repoRoot: tmp,
        featureSlug: 'feat-a',
        auditLogPath: logA,
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
        allowMissingFeature: true,
      });
      expect(turnA.exitCode).toBe(0);
      expect(turnA.report?.auditRead.newWatermark).toBe('AUDIT-A-20260527-01');

      const turnB = await runOrchestratorTurnCli({
        repoRoot: tmp,
        featureSlug: 'feat-b',
        auditLogPath: logB,
        skipJudge: true,
        skipAuditor: true,
        now: '2026-05-27T00:00:00.000Z',
        allowMissingFeature: true,
      });
      expect(turnB.exitCode).toBe(0);
      expect(turnB.report?.auditRead.priorWatermark).toBe('');
      expect(turnB.report?.auditRead.newWatermark).toBe('AUDIT-B-20260527-99');

      const statePathA = resolve(tmp, RUNTIME_DIR, 'feat-a', 'loop-state.json');
      const statePathB = resolve(tmp, RUNTIME_DIR, 'feat-b', 'loop-state.json');
      const textA = await readFile(statePathA, 'utf8');
      const textB = await readFile(statePathB, 'utf8');
      const parsedA = JSON.parse(textA);
      const parsedB = JSON.parse(textB);
      expect(parsedA.lastAuditWatermark).toBe('AUDIT-A-20260527-01');
      expect(parsedB.lastAuditWatermark).toBe('AUDIT-B-20260527-99');
    });
  });

  describe('TF-013 — --slug alias for --feature', () => {
    it('--slug X works identically to --feature X (CLI shim parse)', () => {
      const a = parseFlags(['--feature', 'my-slug']);
      const b = parseFlags(['--slug', 'my-slug']);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      expect(a.args?.cli.featureSlug).toBe('my-slug');
      expect(b.args?.cli.featureSlug).toBe('my-slug');
    });

    it('--slug + --feature with the same value works', () => {
      const r = parseFlags(['--feature', 'same', '--slug', 'same']);
      expect(r.ok).toBe(true);
      expect(r.args?.cli.featureSlug).toBe('same');
    });

    it('--slug X --feature Y exits 2 (error)', () => {
      const r = parseFlags(['--feature', 'Y', '--slug', 'X']);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/different values/);
    });

    it('neither --slug nor --feature: usage error', () => {
      const r = parseFlags([]);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/--feature.*required/);
    });

    it('--help is recognized', () => {
      const r = parseFlags(['--help']);
      expect(r.help).toBe(true);
    });

    it('--allow-missing-feature is parsed', () => {
      const r = parseFlags(['--feature', 'x', '--allow-missing-feature']);
      expect(r.ok).toBe(true);
      expect(r.args?.cli.allowMissingFeature).toBe(true);
    });
  });
});
