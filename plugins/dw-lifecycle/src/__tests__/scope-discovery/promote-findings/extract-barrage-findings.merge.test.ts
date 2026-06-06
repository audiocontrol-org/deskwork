/**
 * Phase 29 Task 1 — bug-repro tests for #427.
 *
 * `extract-barrage-findings.ts` previously drew cluster edges when EITHER
 * headings agreed OR surfaces shared a path token. With transitivity, this
 * over-merged distinct mechanisms that happened to touch the same file.
 *
 * The cure: require BOTH heading-substring agreement AND surface path-token
 * agreement before drawing an edge, AND concatenate every cluster member's
 * body into the merged entry (not just the representative's).
 *
 * Fixtures mirror the three real-world cases #427 named from design-control:
 *   - AUDIT-20260605-01 — 5 distinct findings in lint plugin chained via
 *     surface alone (claude-01 EngineMethod single-sourcing + claude-03
 *     preflight default-adapter + claude-04 confidence-check dup + codex-01
 *     method/envelope binding + codex-03 deferral comments).
 *   - AUDIT-20260606-01 — 3 distinct MEDIUMs about <link>/scheme handling
 *     chained because all surfaces named allowlist.ts.
 *   - AUDIT-20260606-04 — coupling MED + 2 honesty LOWs chained.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractBarrageFindings } from '../../../scope-discovery/promote-findings/extract-barrage-findings.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'ebf-merge-'));
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

function finding(
  modelName: string,
  index: number,
  headingText: string,
  surface: string,
  body: string,
  severity = 'medium',
): string {
  return [
    `### ${headingText}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${modelName}-0${index}`,
    `Status:     open`,
    `Severity:   ${severity}`,
    `Surface:    ${surface}`,
    '',
    body,
    '',
  ].join('\n');
}

describe('#427 bug-repro: AUDIT-20260605-01 five distinct findings in lint plugin', () => {
  it('does NOT chain 5 distinct mechanisms into one cluster via surface-only edges', async () => {
    // Real-world shape: all 5 findings touched the same file (allowlist.ts)
    // at different line ranges, surfacing 5 distinct mechanisms. The OR-edge
    // surface match chained them all into one cluster.
    const claudeMd = [
      finding(
        'claude',
        1,
        'EngineMethod single-sourcing missing',
        'plugins/design-control/src/lint/allowlist.ts:42',
        'Engine method is registered in two places.',
        'high',
      ),
      finding(
        'claude',
        3,
        'Preflight default-adapter hardcoded',
        'plugins/design-control/src/lint/allowlist.ts:88',
        'Preflight skips the adapter lookup and hardcodes a default.',
        'medium',
      ),
      finding(
        'claude',
        4,
        'Confidence-check duplicated three times',
        'plugins/design-control/src/lint/allowlist.ts:120',
        'The [0,1] confidence check is duplicated in three call sites.',
        'medium',
      ),
    ].join('\n');
    const codexMd = [
      finding(
        'codex',
        1,
        'Method-envelope binding wrong on rebind',
        'plugins/design-control/src/lint/allowlist.ts:55',
        'Rebinding leaks the prior envelope.',
        'high',
      ),
      finding(
        'codex',
        3,
        'Deferral comments still in source',
        'plugins/design-control/src/lint/allowlist.ts:200',
        'TODO/FIXME comments left in.',
        'low',
      ),
    ].join('\n');
    const runDir = makeRunDir('audit-20260605-01-fixture', {
      'claude.md': claudeMd,
      'codex.md': codexMd,
    });
    const findings = await extractBarrageFindings({ runDir });

    expect(findings.length).toBeGreaterThanOrEqual(5);
    const headings = findings.map((f) => f.heading);
    expect(headings).toContain('EngineMethod single-sourcing missing');
    expect(headings).toContain('Preflight default-adapter hardcoded');
    expect(headings).toContain('Confidence-check duplicated three times');
    expect(headings).toContain('Method-envelope binding wrong on rebind');
    expect(headings).toContain('Deferral comments still in source');
  });
});

describe('#427 bug-repro: AUDIT-20260606-01 three distinct MEDIUMs about <link>/scheme handling', () => {
  it('does NOT bury mixed-rel + control-char findings behind a data-uri merged entry', async () => {
    const claudeMd = [
      finding(
        'claude',
        1,
        'data:-URI over-rejection in scheme scan',
        'plugins/design-control/src/lint/allowlist.ts:120',
        'data: URIs are rejected even for safe MIME types.',
        'medium',
      ),
      finding(
        'claude',
        2,
        'Mixed-rel <link> bypass in tag check',
        'plugins/design-control/src/lint/allowlist.ts:180',
        'Mixed rel="stylesheet preload" bypasses the tag-rel allowlist.',
        'medium',
      ),
    ].join('\n');
    const codexMd = [
      finding(
        'codex',
        1,
        'Mixed-rel bypass on link[rel]',
        'plugins/design-control/src/lint/allowlist.ts:185',
        'When multiple rel values are present, allowlist matching uses only the first.',
        'medium',
      ),
      finding(
        'codex',
        2,
        'Control-char scheme obfuscation',
        'plugins/design-control/src/lint/allowlist.ts:140',
        'Schemes with control characters bypass the scheme scan.',
        'medium',
      ),
    ].join('\n');
    const runDir = makeRunDir('audit-20260606-01-fixture', {
      'claude.md': claudeMd,
      'codex.md': codexMd,
    });
    const findings = await extractBarrageFindings({ runDir });

    const dataUriEntries = findings.filter((f) => f.heading.toLowerCase().includes('data:'));
    const mixedRelEntries = findings.filter((f) => f.heading.toLowerCase().includes('mixed-rel'));
    const controlCharEntries = findings.filter((f) => f.heading.toLowerCase().includes('control-char'));

    expect(dataUriEntries.length).toBe(1);
    expect(mixedRelEntries.length).toBeGreaterThanOrEqual(1);
    expect(controlCharEntries.length).toBe(1);
  });

  it('legitimately merges mixed-rel claude+codex pair (same cause + same surface)', async () => {
    const claudeMd = finding(
      'claude',
      2,
      'Mixed-rel link bypass in tag check allowlist',
      'plugins/design-control/src/lint/allowlist.ts:180',
      'Mixed rel="stylesheet preload" bypasses the tag-rel allowlist.',
      'medium',
    );
    const codexMd = finding(
      'codex',
      1,
      'Mixed-rel link bypass on link rel attribute',
      'plugins/design-control/src/lint/allowlist.ts:185',
      'Multiple rel values: matching uses only the first.',
      'medium',
    );
    const runDir = makeRunDir('audit-20260606-01-legit-merge', {
      'claude.md': claudeMd,
      'codex.md': codexMd,
    });
    const findings = await extractBarrageFindings({ runDir });

    expect(findings.length).toBe(1);
    expect(findings[0]?.crossModelAgreement).toBe(true);
    expect(findings[0]?.sourceModels.sort()).toEqual(['claude', 'codex']);
  });
});

describe('#427 bug-repro: merged entries preserve every model body, not just representative', () => {
  it('concatenates every cluster member body when models legitimately agree', async () => {
    const claudeMd = finding(
      'claude',
      1,
      'Race condition in dispatch loop',
      'plugins/dw-lifecycle/src/dispatch.ts:42',
      'Claude says: the dispatch loop yields before draining the queue.',
      'high',
    );
    const codexMd = finding(
      'codex',
      1,
      'Race condition in dispatch loop on shutdown',
      'plugins/dw-lifecycle/src/dispatch.ts:50',
      'Codex says: shutdown signal can race with in-flight calls.',
      'high',
    );
    const runDir = makeRunDir('body-concat', {
      'claude.md': claudeMd,
      'codex.md': codexMd,
    });
    const findings = await extractBarrageFindings({ runDir });

    expect(findings.length).toBe(1);
    const merged = findings[0]!;
    expect(merged.body).toContain('Claude says');
    expect(merged.body).toContain('Codex says');
  });
});
