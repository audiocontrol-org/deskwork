/**
 * End-to-end orchestrator-loop tests.
 *
 * Plants synthetic catalog + audit-log state on disk; runs
 * `runOrchestratorTurn`; asserts that the composed turn report
 * carries the expected outputs from every wired sub-library:
 *
 *   - audit-log reader (Task 7)
 *   - wrong-decision detector + reversal proposal (Task 8)
 *   - mediation cluster + summaries (Task 3)
 *   - controller decision (Task 5)
 *   - external auditor fire (Task 7)
 *   - escalation visibility (Task 9)
 *
 * Per the project test rules: fixture trees on disk; no fs mocks.
 * Shared synthetic-input builders live in `loop-turn.fixtures.ts`.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  projectMetricsSnapshot,
  runOrchestratorTurn,
} from '../../../scope-discovery/orchestrator-loop/loop-turn.js';
import type { TurnInput } from '../../../scope-discovery/orchestrator-loop/loop-types.js';
import type { DispatchFn } from '../../../scope-discovery/dispatch-wrapper.js';
import type { CatalogEntryView } from '../../../scope-discovery/recovery/detect-wrong-decisions.js';
import type { CodebaseStateMetrics } from '../../../scope-discovery/discovery-agents/codebase-state-metrics-types.js';
import {
  emptyAuditorInput,
  emptyJudgeInput,
  fakeMetrics,
  judgeResponse,
  makePatternFinding,
} from './loop-turn.fixtures.js';

const RUNTIME_DIR = '.dw-lifecycle/scope-discovery/orchestrator-runtime';
const PENDING_AUDITS_DIR = '.dw-lifecycle/scope-discovery/pending-audits';

describe('orchestrator-loop/loop-turn', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'loop-turn-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('cold-start turn: no audit-log, no findings; emits zeroed report', async () => {
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'audit-log.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.auditRead.newEntryCount).toBe(0);
    expect(report.wrongDecisions.length).toBe(0);
    expect(report.reversalProposals.length).toBe(0);
    expect(report.mediationClusters.length).toBe(0);
    expect(report.mediationSummaries.length).toBe(0);
    expect(report.judgeResult).toBeUndefined();
    expect(report.auditorArtifactPath).toBeUndefined();
    expect(report.controllerDecision.frequency).toBeCloseTo(1.0, 3);
    expect(report.controllerDecision.intensity).toBeCloseTo(1.0, 3);
    expect(report.summary).toMatch(/0 new audit entries/);
    expect(report.summary).toMatch(/judge skipped/);
    expect(report.summary).toMatch(/auditor skipped/);
    expect(report.nextLoopState.lastTurnId).toBe(report.turnId);
    expect(report.nextLoopState.turnHistory[0]?.turnId).toBe(report.turnId);
  });

  it('reads new audit-log entries since the watermark', async () => {
    const auditLogPath = join(tmp, 'audit-log.md');
    const log = [
      '# audit log',
      '',
      '### AUDIT-20260526-01: catalogue stub',
      'Finding-ID: AUDIT-20260526-01',
      'Status:   open',
      'Severity: medium',
      'Surface:  src/foo.ts',
      '',
      'Body of finding 01.',
      '',
      '### AUDIT-20260526-02: another stub',
      'Finding-ID: AUDIT-20260526-02',
      'Status:   open',
      'Severity: low',
      'Surface:  src/bar.ts',
      '',
      'Body of finding 02.',
      '',
    ].join('\n');
    await writeFile(auditLogPath, log, 'utf8');
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath,
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.auditRead.newEntryCount).toBe(2);
    expect(report.auditRead.newWatermark).toBe('AUDIT-20260526-02');
    expect(report.auditRead.priorWatermark).toBe('');
    expect(report.nextLoopState.lastAuditWatermark).toBe('AUDIT-20260526-02');
  });

  it('detects a wrong-decision when audit-log overturns an agent-driven entry', async () => {
    const auditLogPath = join(tmp, 'audit-log.md');
    const log = [
      '# audit log',
      '',
      '### AUDIT-20260526-03: overturning the cursed decision on negative-12',
      'Finding-ID: AUDIT-20260526-03',
      'Status:   open',
      'Severity: high',
      'Surface:  anti-patterns.yaml#negative-12',
      'Affects: anti-patterns.yaml#negative-12',
      '',
      'The auditor overturns the prior cursed designation; the editor in question DOES consume the canonical primitive (the negative-space regex was wrong).',
      '',
    ].join('\n');
    await writeFile(auditLogPath, log, 'utf8');

    const catalogEntries: ReadonlyArray<CatalogEntryView> = [
      {
        registryPath: 'anti-patterns.yaml',
        entryId: 'negative-12',
        status: 'cursed',
        provenance: {
          source: 'orchestrator-agent',
          authored_at: '2026-05-26T11:00:00.000Z',
          authored_by: 'orchestrator',
          context: 'scan-run-id-abc',
        },
        patternType: 'negative-space',
      },
    ];

    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath,
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries,
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.wrongDecisions.length).toBe(1);
    expect(report.wrongDecisions[0]?.catalogEntryId).toBe('negative-12');
    expect(report.wrongDecisions[0]?.findingId).toBe('AUDIT-20260526-03');
    expect(report.reversalProposals.length).toBe(1);
    expect(report.reversalProposals[0]?.targetStatus).toBe('withdrawn');
    expect(report.reversalProposals[0]?.targetProvenance.context).toBe(
      'audit-finding-AUDIT-20260526-03',
    );
  });

  it('clusters findings via mediation library', async () => {
    const f1 = makePatternFinding(
      'p1',
      'utility-class blanket',
      String.raw`className=".*\bbg-\w+\b`,
      ['src/a.tsx', 'src/b.tsx', 'src/c.tsx'],
    );
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [f1],
      catalogEntries: [],
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.mediationClusters.length).toBeGreaterThan(0);
    expect(report.mediationSummaries.length).toBe(
      report.mediationClusters.length,
    );
  });

  it('runs the judge when judgeInput is supplied; skips otherwise', async () => {
    const dispatched: string[] = [];
    const dispatchFn: DispatchFn = async (args) => {
      dispatched.push(args.agentType);
      return judgeResponse({
        proposals: [
          {
            candidateId: 'cand-1',
            status: 'cursed',
            confidence: '0.9',
            reasoning: 'evidence in src/foo.ts:14',
          },
        ],
      });
    };
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn,
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      judgeInput: emptyJudgeInput(),
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.judgeResult).toBeDefined();
    expect(report.judgeResult?.proposals.length).toBe(1);
    expect(report.judgeResult?.proposals[0]?.candidateId).toBe('cand-1');
    expect(dispatched.length).toBe(1);
    expect(report.summary).toMatch(/judge ran/);
  });

  it('fires the external auditor when auditorInput is supplied', async () => {
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      auditorInput: emptyAuditorInput(),
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.auditorArtifactPath).toBeDefined();
    const text = await readFile(report.auditorArtifactPath!, 'utf8');
    const parsed = JSON.parse(text);
    expect(parsed.featureSlug).toBe('test');
    expect(parsed.prompt.length).toBeGreaterThan(0);
    expect(report.summary).toMatch(/auditor fired/);
  });

  it('honors skipAuditorFire option', async () => {
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      auditorInput: emptyAuditorInput(),
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input, { skipAuditorFire: true });
    expect(report.auditorArtifactPath).toBeUndefined();
    expect(report.summary).toMatch(/auditor skipped/);
  });

  it('persists controller state to disk after running', async () => {
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      now: '2026-05-26T12:00:00.000Z',
    };
    await runOrchestratorTurn(input);
    const statePath = join(tmp, RUNTIME_DIR, 'test', 'controller-state.json');
    const text = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe(1);
    expect(parsed.history.length).toBe(1);
  });

  it('persists audit watermark to disk after running', async () => {
    const auditLogPath = join(tmp, 'audit-log.md');
    const log = [
      '### AUDIT-20260526-99: synthetic',
      'Finding-ID: AUDIT-20260526-99',
      'Status:   open',
      '',
      'Body.',
      '',
    ].join('\n');
    await writeFile(auditLogPath, log, 'utf8');
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath,
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      now: '2026-05-26T12:00:00.000Z',
    };
    await runOrchestratorTurn(input);
    const watermarkPath = join(tmp, RUNTIME_DIR, 'test', 'last-audit-read.json');
    const parsed = JSON.parse(await readFile(watermarkPath, 'utf8'));
    expect(parsed.watermark).toBe('AUDIT-20260526-99');
  });

  it('includes escalationVisibility (empty when no queue)', async () => {
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.escalationVisibility.count).toBe(0);
    expect(report.escalationVisibility.rows.length).toBe(0);
  });

  it('uses loopStateOverride when supplied (skips on-disk read)', async () => {
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input, {
      loopStateOverride: {
        version: 1,
        lastAuditWatermark: 'AUDIT-99999999-99',
        lastTurnId: 'override',
        turnHistory: [],
        persistedAt: '2026-05-26T11:00:00.000Z',
      },
    });
    expect(report.auditRead.priorWatermark).toBe('AUDIT-99999999-99');
    expect(report.auditRead.newWatermark).toBe('AUDIT-99999999-99');
  });

  it('auditor artifact lands under the configured pending-audits dir', async () => {
    const input: TurnInput = {
      repoRoot: tmp,
      featureSlug: 'audit-test',
      auditLogPath: join(tmp, 'no-audit.md'),
      dispatchFn: async () => judgeResponse({ proposals: [] }),
      currentMetrics: fakeMetrics('2026-05-26T12:00:00.000Z'),
      findings: [],
      catalogEntries: [],
      auditorInput: emptyAuditorInput(),
      now: '2026-05-26T12:00:00.000Z',
    };
    const report = await runOrchestratorTurn(input);
    expect(report.auditorArtifactPath).toBeDefined();
    expect(report.auditorArtifactPath).toContain(PENDING_AUDITS_DIR);
  });

  describe('projectMetricsSnapshot', () => {
    it('projects classification ratio + averages + sums', () => {
      const metrics = fakeMetrics('2026-05-26T12:00:00.000Z');
      const snap = projectMetricsSnapshot(metrics);
      expect(snap.classification_completeness).toBe(0.8);
      expect(snap.average_coverage).toBeCloseTo(0.7, 5);
      expect(snap.violation_density).toBe(50);
      expect(snap.average_surface_variance).toBeCloseTo(0.2, 5);
      expect(snap.catalog_edit_rate).toBeCloseTo(0.25, 5);
      expect(snap.pending_count).toBe(2);
      expect(snap.median_disposition_latency_ms).toBeNull();
    });

    it('handles empty collections gracefully', () => {
      const metrics: CodebaseStateMetrics = {
        ...fakeMetrics('2026-05-26T12:00:00.000Z'),
        coverage_per_blessed_pattern: [],
        violation_density_per_cursed_pattern: [],
        surface_uniformity: [],
      };
      const snap = projectMetricsSnapshot(metrics);
      expect(snap.average_coverage).toBe(0);
      expect(snap.violation_density).toBe(0);
      expect(snap.average_surface_variance).toBe(0);
    });
  });
});
