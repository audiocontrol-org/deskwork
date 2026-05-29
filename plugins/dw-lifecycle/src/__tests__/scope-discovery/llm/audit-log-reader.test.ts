/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/llm/audit-log-reader.test.ts
 *
 * Audit-log reader — Phase 11 Task 7. Uses fixture audit-log files on
 * disk (per testing.md: "use fixture project trees on disk, never mock
 * the filesystem").
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadAuditWatermark,
  persistAuditWatermark,
  readAuditLogFile,
  readAuditLogUpdates,
} from '../../../scope-discovery/llm/audit-log-reader.js';
import { DEFAULT_LLM_CONFIG } from '../../../scope-discovery/llm/config.js';
import { isPlainObject } from '../../../scope-discovery/util/typeguards.js';

function readJsonObj(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!isPlainObject(parsed)) {
    throw new Error('expected JSON to parse to an object');
  }
  return parsed;
}

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'audit-log-reader-'));
});

afterAll(async () => {
  if (root !== undefined && root.length > 0) {
    await rm(root, { recursive: true, force: true });
  }
});

const SAMPLE_AUDIT_LOG = [
  '# Audit Log',
  '',
  'How to operate this log: see preamble.',
  '',
  '---',
  '',
  '## 2026-05-26 Branch Implementation Audit',
  '',
  '### First finding heading',
  '',
  'Finding-ID: AUDIT-20260526-01',
  'Status:     open',
  'Severity:   medium',
  'Surface:    `plugins/foo.ts`',
  'Provenance: external-auditor (claude-opus-4)',
  'Affects:    pattern-matrix/foo-id, anti-patterns/bar-id',
  '',
  'Body paragraph one.',
  '',
  'Body paragraph two.',
  '',
  '### Second finding heading',
  '',
  'Finding-ID: AUDIT-20260526-02',
  'Status:     fixed-abc1234',
  'Severity:   high',
  'Surface:    `plugins/bar.ts`',
  '',
  'Body for finding two.',
  '',
  '### Section heading that is not a finding (no Finding-ID)',
  '',
  'Just a section without a Finding-ID; the reader should ignore it.',
  '',
  '### Third finding heading',
  '',
  'Finding-ID: AUDIT-20260527-01',
  'Status:     open',
  'Severity:   informational',
  '',
  'Body for finding three.',
].join('\n');

describe('readAuditLogFile', () => {
  it('parses three findings from a fixture log + skips non-finding section', async () => {
    const logPath = join(root, 'sample-audit-log.md');
    await writeFile(logPath, SAMPLE_AUDIT_LOG, 'utf8');
    const result = await readAuditLogFile(logPath, '');
    expect(result.entries.length).toBe(3);
    expect(result.entries.map((e) => e.findingId)).toEqual([
      'AUDIT-20260526-01',
      'AUDIT-20260526-02',
      'AUDIT-20260527-01',
    ]);
    expect(result.watermark).toBe('AUDIT-20260527-01');
  });

  it('extracts Affects + Provenance fields when present', async () => {
    const logPath = join(root, 'sample-audit-log.md');
    await writeFile(logPath, SAMPLE_AUDIT_LOG, 'utf8');
    const result = await readAuditLogFile(logPath, '');
    const first = result.entries.find(
      (e) => e.findingId === 'AUDIT-20260526-01',
    );
    expect(first).toBeDefined();
    expect(first?.provenance).toBe('external-auditor (claude-opus-4)');
    expect(first?.affects).toEqual([
      'pattern-matrix/foo-id',
      'anti-patterns/bar-id',
    ]);
  });

  it('honors the watermark to skip entries already seen', async () => {
    const logPath = join(root, 'sample-audit-log.md');
    await writeFile(logPath, SAMPLE_AUDIT_LOG, 'utf8');
    const result = await readAuditLogFile(logPath, 'AUDIT-20260526-02');
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.findingId).toBe('AUDIT-20260527-01');
    expect(result.watermark).toBe('AUDIT-20260527-01');
  });

  it('returns the original watermark when all entries are already seen', async () => {
    const logPath = join(root, 'sample-audit-log.md');
    await writeFile(logPath, SAMPLE_AUDIT_LOG, 'utf8');
    const result = await readAuditLogFile(logPath, 'AUDIT-20260527-01');
    expect(result.entries.length).toBe(0);
    expect(result.watermark).toBe('AUDIT-20260527-01');
  });

  it('returns empty entries + the supplied watermark when the file does not exist', async () => {
    const result = await readAuditLogFile(
      join(root, 'missing-file.md'),
      'AUDIT-20260101-00',
    );
    expect(result.entries.length).toBe(0);
    expect(result.watermark).toBe('AUDIT-20260101-00');
  });

  it('extracts heading + body verbatim', async () => {
    const logPath = join(root, 'sample-audit-log.md');
    await writeFile(logPath, SAMPLE_AUDIT_LOG, 'utf8');
    const result = await readAuditLogFile(logPath, '');
    const second = result.entries.find(
      (e) => e.findingId === 'AUDIT-20260526-02',
    );
    expect(second?.heading).toBe('Second finding heading');
    expect(second?.body).toContain('Body for finding two');
  });
});

const TEST_FEATURE_SLUG = 'wm-test-feature';

describe('loadAuditWatermark + persistAuditWatermark', () => {
  it('returns empty string when no watermark file exists', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'wm-empty-'));
    try {
      const wm = await loadAuditWatermark(isolatedRoot, TEST_FEATURE_SLUG, DEFAULT_LLM_CONFIG);
      expect(wm).toBe('');
    } finally {
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  });

  it('round-trips a watermark through persist + load', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'wm-rt-'));
    try {
      await persistAuditWatermark(
        isolatedRoot,
        TEST_FEATURE_SLUG,
        'AUDIT-20260526-05',
        DEFAULT_LLM_CONFIG,
      );
      const wm = await loadAuditWatermark(isolatedRoot, TEST_FEATURE_SLUG, DEFAULT_LLM_CONFIG);
      expect(wm).toBe('AUDIT-20260526-05');
    } finally {
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  });

  it('per-feature isolation: different slugs do NOT share watermark', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'wm-iso-'));
    try {
      await persistAuditWatermark(isolatedRoot, 'feature-a', 'AUDIT-A-99', DEFAULT_LLM_CONFIG);
      await persistAuditWatermark(isolatedRoot, 'feature-b', 'AUDIT-B-42', DEFAULT_LLM_CONFIG);
      const wmA = await loadAuditWatermark(isolatedRoot, 'feature-a', DEFAULT_LLM_CONFIG);
      const wmB = await loadAuditWatermark(isolatedRoot, 'feature-b', DEFAULT_LLM_CONFIG);
      expect(wmA).toBe('AUDIT-A-99');
      expect(wmB).toBe('AUDIT-B-42');
    } finally {
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  });

  it('persists to the configured orchestrator runtime dir', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'wm-cfg-'));
    try {
      const customConfig = {
        ...DEFAULT_LLM_CONFIG,
        orchestratorRuntimeDir: '.custom/runtime',
      };
      await persistAuditWatermark(isolatedRoot, TEST_FEATURE_SLUG, 'AUDIT-X', customConfig);
      const text = await readFile(
        join(isolatedRoot, '.custom/runtime', TEST_FEATURE_SLUG, 'last-audit-read.json'),
        'utf8',
      );
      const parsed = readJsonObj(text);
      expect(parsed['watermark']).toBe('AUDIT-X');
    } finally {
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  });
});

describe('readAuditLogUpdates — high-level entry point', () => {
  it('combines watermark load + audit-log read', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'rlau-'));
    try {
      // Persist a watermark + write a log file with one new entry past it.
      await persistAuditWatermark(
        isolatedRoot,
        TEST_FEATURE_SLUG,
        'AUDIT-20260526-01',
        DEFAULT_LLM_CONFIG,
      );
      const logPath = join(isolatedRoot, 'audit-log.md');
      await mkdir(join(isolatedRoot), { recursive: true });
      await writeFile(logPath, SAMPLE_AUDIT_LOG, 'utf8');
      const result = await readAuditLogUpdates({
        repoRoot: isolatedRoot,
        featureSlug: TEST_FEATURE_SLUG,
        auditLogPath: logPath,
        configOverride: DEFAULT_LLM_CONFIG,
      });
      expect(result.entries.length).toBe(2);
      expect(result.entries.map((e) => e.findingId)).toEqual([
        'AUDIT-20260526-02',
        'AUDIT-20260527-01',
      ]);
      expect(result.watermark).toBe('AUDIT-20260527-01');
    } finally {
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  });

  it('first-run case (no watermark, no log file) returns clean empty result', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'rlau-first-'));
    try {
      const result = await readAuditLogUpdates({
        repoRoot: isolatedRoot,
        featureSlug: TEST_FEATURE_SLUG,
        auditLogPath: join(isolatedRoot, 'missing.md'),
        configOverride: DEFAULT_LLM_CONFIG,
      });
      expect(result.entries.length).toBe(0);
      expect(result.watermark).toBe('');
    } finally {
      await rm(isolatedRoot, { recursive: true, force: true });
    }
  });
});
