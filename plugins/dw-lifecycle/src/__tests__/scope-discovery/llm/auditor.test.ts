/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/llm/auditor.test.ts
 *
 * External LLM auditor — Phase 11 Task 7. Tests the fire-and-forget
 * artifact emission: the library writes an audit-request JSON under
 * `<repoRoot>/<pendingAuditsDir>/audit-request-<id>.json`; the external
 * auditor process reads it asynchronously + writes results to the
 * audit-log.
 *
 * No real LLM call occurs — the library's job is to render the prompt
 * + emit the artifact. The external process is operator-provided.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fireExternalAudit } from '../../../scope-discovery/llm/auditor.js';
import { DEFAULT_LLM_CONFIG } from '../../../scope-discovery/llm/config.js';
import { isPlainObject } from '../../../scope-discovery/util/typeguards.js';

function readJsonObj(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!isPlainObject(parsed)) {
    throw new Error('expected JSON to parse to an object');
  }
  return parsed;
}

function asObj(v: unknown): Record<string, unknown> {
  if (!isPlainObject(v)) {
    throw new Error('expected value to be an object');
  }
  return v;
}

function asArrayOfObjs(
  v: unknown,
): ReadonlyArray<Record<string, unknown>> {
  if (!Array.isArray(v)) {
    throw new Error('expected value to be an array');
  }
  return v.map(asObj);
}
import type {
  AuditorInput,
  CatalogStateSummary,
  JudgeDispositionProposal,
} from '../../../scope-discovery/llm/types.js';

let testRoot: string;

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'auditor-test-'));
});

afterAll(async () => {
  if (testRoot !== undefined && testRoot.length > 0) {
    await rm(testRoot, { recursive: true, force: true });
  }
});

function emptyCatalogState(): CatalogStateSummary {
  return {
    statusCounts: {
      pending: 0,
      blessed: 0,
      cursed: 0,
      ignore: 0,
      'tracked-holdout': 0,
      withdrawn: 0,
    },
    totalEntries: 0,
  };
}

function sampleInput(): AuditorInput {
  const proposals: ReadonlyArray<JudgeDispositionProposal> = [
    {
      candidateId: 'cand-1',
      proposedStatus: 'cursed',
      confidence: 0.9,
      reasoning: 'judge saw regression at src/foo.ts:14',
    },
  ];
  return {
    featureSlug: 'scope-discovery',
    recentWork: {
      lastCommit: { sha: 'abc1234', subject: 'feat(scope): example commit' },
    },
    judgeProposals: proposals,
    catalogState: emptyCatalogState(),
  };
}

describe('fireExternalAudit', () => {
  it('writes an audit-request artifact under the pending-audits dir', async () => {
    const path = await fireExternalAudit(sampleInput(), {
      repoRoot: testRoot,
      configOverride: DEFAULT_LLM_CONFIG,
      idOverride: 'test-1',
      emittedAtOverride: '2026-05-26T00:00:00.000Z',
    });
    expect(path).toBe(
      join(
        testRoot,
        '.dw-lifecycle',
        'scope-discovery',
        'pending-audits',
        'audit-request-test-1.json',
      ),
    );
    const text = await readFile(path, 'utf8');
    const obj = readJsonObj(text);
    expect(obj['id']).toBe('test-1');
    expect(obj['emittedAt']).toBe('2026-05-26T00:00:00.000Z');
    expect(obj['model']).toBe(DEFAULT_LLM_CONFIG.auditor.model);
    expect(obj['featureSlug']).toBe('scope-discovery');
    expect(typeof obj['prompt']).toBe('string');
    // The rendered prompt should contain the feature slug + judge
    // proposal block so the external auditor has what it needs.
    expect(obj['prompt']).toContain('scope-discovery');
    expect(obj['prompt']).toContain('cand-1');
  });

  it('honors a per-input modelOverride', async () => {
    const path = await fireExternalAudit(
      { ...sampleInput(), modelOverride: 'override-auditor-model' },
      {
        repoRoot: testRoot,
        configOverride: DEFAULT_LLM_CONFIG,
        idOverride: 'test-2',
        emittedAtOverride: '2026-05-26T00:00:01.000Z',
      },
    );
    const text = await readFile(path, 'utf8');
    const obj = readJsonObj(text);
    expect(obj['model']).toBe('override-auditor-model');
  });

  it('preserves the full input shape inside the artifact for the external process', async () => {
    const input = sampleInput();
    const path = await fireExternalAudit(input, {
      repoRoot: testRoot,
      configOverride: DEFAULT_LLM_CONFIG,
      idOverride: 'test-3',
      emittedAtOverride: '2026-05-26T00:00:02.000Z',
    });
    const text = await readFile(path, 'utf8');
    const obj = readJsonObj(text);
    const inputs = asObj(obj['inputs']);
    expect(inputs['featureSlug']).toBe('scope-discovery');
    const proposals = asArrayOfObjs(inputs['judgeProposals']);
    expect(proposals.length).toBe(1);
    expect(proposals[0]?.['candidateId']).toBe('cand-1');
    expect(proposals[0]?.['confidence']).toBe(0.9);
  });

  it('uses the orchestrator-provided pending-audits dir from config', async () => {
    const path = await fireExternalAudit(sampleInput(), {
      repoRoot: testRoot,
      configOverride: {
        ...DEFAULT_LLM_CONFIG,
        auditor: {
          ...DEFAULT_LLM_CONFIG.auditor,
          pendingAuditsDir: '.custom-audits-dir',
        },
      },
      idOverride: 'test-4',
      emittedAtOverride: '2026-05-26T00:00:03.000Z',
    });
    expect(path).toBe(
      join(testRoot, '.custom-audits-dir', 'audit-request-test-4.json'),
    );
  });
});
