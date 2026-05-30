/**
 * Phase 15 Task 2 — audit-barrage finding extraction library.
 *
 * Tests for the pure-fn `extractBarrageFindings({runDir})` that walks
 * an audit-runs directory's per-model markdown files and extracts
 * structured `ExtractedFinding` records with cross-model agreement
 * merged.
 *
 * Real-fs fixtures via mkdtempSync mirror sibling tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractBarrageFindings,
  normalizeSeverity,
  parseModelMarkdown,
} from '../../../scope-discovery/promote-findings/extract-barrage-findings.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'ebf-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRunDir(name: string, files: Record<string, string>): string {
  const runDir = join(workDir, name);
  mkdirSync(runDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(runDir, filename), content, 'utf8');
  }
  return runDir;
}

const SAMPLE_FINDING_BODY = [
  'The issue is that the parser does not handle the empty case.',
  '',
  'This affects every call site that passes an empty array as input.',
].join('\n');

function singleFindingMarkdown(
  modelName: string,
  headingText: string,
  surface: string,
  severity = 'high',
  bodyOverride?: string,
): string {
  return [
    `### ${headingText}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${modelName}-01`,
    `Status:     open`,
    `Severity:   ${severity}`,
    `Surface:    ${surface}`,
    '',
    bodyOverride ?? SAMPLE_FINDING_BODY,
    '',
  ].join('\n');
}

describe('normalizeSeverity — case + canonical-set mapping', () => {
  it('passes through canonical values unchanged', () => {
    expect(normalizeSeverity('blocking')).toBe('blocking');
    expect(normalizeSeverity('high')).toBe('high');
    expect(normalizeSeverity('medium')).toBe('medium');
    expect(normalizeSeverity('low')).toBe('low');
    expect(normalizeSeverity('informational')).toBe('informational');
  });

  it('lowercases mixed-case input', () => {
    expect(normalizeSeverity('HIGH')).toBe('high');
    expect(normalizeSeverity('High')).toBe('high');
    expect(normalizeSeverity('Blocking')).toBe('blocking');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSeverity('   medium   ')).toBe('medium');
  });

  it("falls back to 'informational' on unknown values", () => {
    expect(normalizeSeverity('critical')).toBe('informational');
    expect(normalizeSeverity('')).toBe('informational');
    expect(normalizeSeverity('???')).toBe('informational');
  });
});

describe('parseModelMarkdown — split on ### + field-block parse', () => {
  it('extracts a single finding with all fields populated', () => {
    const md = singleFindingMarkdown('claude', 'Parser drops empty input', 'src/parser.ts:42-58');
    const findings = parseModelMarkdown(md, 'claude');
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.model).toBe('claude');
    expect(f.heading).toBe('Parser drops empty input');
    expect(f.severity).toBe('high');
    expect(f.surface).toBe('src/parser.ts:42-58');
    expect(f.body).toContain('empty case');
    expect(f.isClean).toBe(false);
  });

  it('extracts multiple findings from one model file', () => {
    const md = [
      singleFindingMarkdown('codex', 'Finding A', 'src/a.ts:10'),
      singleFindingMarkdown('codex', 'Finding B', 'src/b.ts:20', 'medium'),
    ].join('\n');
    const findings = parseModelMarkdown(md, 'codex');
    expect(findings).toHaveLength(2);
    expect(findings[0]?.heading).toBe('Finding A');
    expect(findings[1]?.heading).toBe('Finding B');
  });

  it("marks 'No findings' CLEAN sentinel with isClean=true", () => {
    const md = [
      '### No findings',
      '',
      'Finding-ID: AUDIT-BARRAGE-gemini-CLEAN',
      'Status:     open',
      'Severity:   informational',
      'Surface:    (the entire diff)',
      '',
      'Walked carefully; nothing to flag.',
      '',
    ].join('\n');
    const findings = parseModelMarkdown(md, 'gemini');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.isClean).toBe(true);
  });

  it('skips blocks missing required fields (no Finding-ID line)', () => {
    const md = [
      '### Heading without finding-id',
      '',
      'Status: open',
      'Severity: high',
      '',
      'Body.',
      '',
    ].join('\n');
    const findings = parseModelMarkdown(md, 'claude');
    expect(findings).toEqual([]);
  });

  it('skips intro prose before the first ### heading', () => {
    const md = [
      'Some preamble explaining the audit approach.',
      '',
      "I'll now list the findings.",
      '',
      singleFindingMarkdown('claude', 'Real finding', 'src/foo.ts:5'),
    ].join('\n');
    const findings = parseModelMarkdown(md, 'claude');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.heading).toBe('Real finding');
  });
});

describe('extractBarrageFindings — top-level extraction + cross-model agreement', () => {
  it('returns empty when run-dir contains no model markdown files', async () => {
    const runDir = makeRunDir('empty', {});
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toEqual([]);
  });

  it('skips INDEX.md and PROMPT.md', async () => {
    const runDir = makeRunDir('skip-meta', {
      'INDEX.md': '### Should not surface\n\nFinding-ID: AUDIT-BARRAGE-x-01\nStatus: open\nSeverity: high\nSurface: x\n\nbody',
      'PROMPT.md': '### Also not\n\nFinding-ID: AUDIT-BARRAGE-y-01\nStatus: open\nSeverity: high\nSurface: y\n\nbody',
      'claude.md': singleFindingMarkdown('claude', 'Real one', 'src/real.ts:10'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.heading).toBe('Real one');
  });

  it('extracts single-model finding (no cross-model agreement)', async () => {
    const runDir = makeRunDir('single', {
      'claude.md': singleFindingMarkdown('claude', 'Parser drops empty input on the validation path', 'src/parser.ts:42'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.sourceModels).toEqual(['claude']);
    expect(findings[0]?.crossModelAgreement).toBe(false);
  });

  it('merges 2-model agreement via heading substring (≥12 chars overlap)', async () => {
    const runDir = makeRunDir('two-agree-heading', {
      'claude.md': singleFindingMarkdown('claude', 'Parser drops empty input on the validation path', 'src/parser.ts:42'),
      'codex.md': singleFindingMarkdown('codex', 'parser drops empty input — bug in fallback case', 'src/parser.ts:55'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.sourceModels.sort()).toEqual(['claude', 'codex']);
    expect(findings[0]?.crossModelAgreement).toBe(true);
  });

  it('merges 3-model agreement', async () => {
    const runDir = makeRunDir('three-agree', {
      'claude.md': singleFindingMarkdown('claude', 'Parser drops empty input on validation', 'src/parser.ts:42'),
      'codex.md': singleFindingMarkdown('codex', 'parser drops empty input — fallback bug', 'src/parser.ts:55'),
      'gemini.md': singleFindingMarkdown('gemini', 'Parser drops empty input issue', 'src/parser.ts:70'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.sourceModels.sort()).toEqual(['claude', 'codex', 'gemini']);
  });

  it('merges 2-model agreement via surface path-token match', async () => {
    const runDir = makeRunDir('two-agree-surface', {
      'claude.md': singleFindingMarkdown('claude', 'Async race condition', 'plugins/dw-lifecycle/src/foo/bar.ts:100'),
      'codex.md': singleFindingMarkdown('codex', 'Promise resolution after dispose', 'plugins/dw-lifecycle/src/foo/bar.ts:120'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.sourceModels.sort()).toEqual(['claude', 'codex']);
  });

  it('keeps 2 findings separate when headings + surfaces are independent', async () => {
    const runDir = makeRunDir('independent', {
      'claude.md': singleFindingMarkdown('claude', 'Validation pipeline misses null branch', 'src/a.ts:10'),
      'codex.md': singleFindingMarkdown('codex', 'Throughput drops under sustained load', 'src/b.ts:20'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(2);
  });

  it('keeps independent findings in same file from same model separate', async () => {
    const md = [
      singleFindingMarkdown('claude', 'Schema migration is destructive on rollback', 'src/x.ts:10'),
      singleFindingMarkdown('claude', 'Logger leaks file handles on shutdown', 'src/y.ts:20'),
    ].join('\n');
    const runDir = makeRunDir('same-model-multi', { 'claude.md': md });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      expect(f.sourceModels).toEqual(['claude']);
    }
  });

  it('filters out CLEAN sentinel blocks', async () => {
    const md = [
      '### No findings',
      '',
      'Finding-ID: AUDIT-BARRAGE-claude-CLEAN',
      'Status:     open',
      'Severity:   informational',
      'Surface:    (the entire diff)',
      '',
      'Clean run.',
      '',
    ].join('\n');
    const runDir = makeRunDir('clean-only', { 'claude.md': md });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toEqual([]);
  });

  it('normalizes severity across models (HIGH → high)', async () => {
    const runDir = makeRunDir('severity-norm', {
      'claude.md': singleFindingMarkdown('claude', 'Issue with the validator', 'src/v.ts:10', 'HIGH'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
  });

  it('merged finding picks the highest severity in the cluster', async () => {
    const runDir = makeRunDir('merged-severity', {
      'claude.md': singleFindingMarkdown('claude', 'Race condition in dispatch', 'src/dispatch.ts:10', 'medium'),
      'codex.md': singleFindingMarkdown('codex', 'Race condition in dispatch — blocking', 'src/dispatch.ts:15', 'blocking'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('blocking');
  });

  it('emits a warning when a model file is malformed (no findings parseable)', async () => {
    const warnings: string[] = [];
    const runDir = makeRunDir('malformed-warn', {
      'claude.md': 'This is just prose with no proper finding blocks at all.',
      'codex.md': singleFindingMarkdown('codex', 'Real one from codex', 'src/r.ts:1'),
    });
    const findings = await extractBarrageFindings({ runDir, warn: (msg) => warnings.push(msg) });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.sourceModels).toEqual(['codex']);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join('\n')).toContain('claude');
  });

  it('handles multi-path Surface across cross-model agreement', async () => {
    const runDir = makeRunDir('multi-path', {
      'claude.md': singleFindingMarkdown('claude', 'Calendar binding drift', 'src/calendar.ts:42, src/binding.ts:88'),
      'codex.md': singleFindingMarkdown('codex', 'Drift between two surfaces', 'src/binding.ts:90'),
    });
    const findings = await extractBarrageFindings({ runDir });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.sourceModels.sort()).toEqual(['claude', 'codex']);
  });
});
