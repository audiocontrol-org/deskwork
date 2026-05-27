/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/util/audit-log-parser.test.ts
 *
 * Phase 11 Task 10 — audit-log parser + bidirectional cross-reference
 * navigation tests. Fixtures plant audit-log markdown files on disk
 * (per testing.md: "use fixture project trees on disk, never mock the
 * filesystem") and exercise the parser end-to-end.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditFindingIdSet,
  citationEntryId,
  citationRegistry,
  findAuditEntriesAffecting,
  findCatalogEntriesAffectedBy,
  parseAuditLogFile,
  parseAuditLogText,
} from '../../../scope-discovery/util/audit-log-parser.js';

function mkTmp(): string {
  return mkdtempSync(join(tmpdir(), 'audit-log-parser-'));
}

describe('parseAuditLogText — basic structure', () => {
  it('returns empty entry list when text is empty', () => {
    const entries = parseAuditLogText('');
    expect(entries).toEqual([]);
  });

  it('returns empty entry list when no `### Finding-ID` blocks present', () => {
    const text = [
      '# Audit Log',
      '',
      'Preamble prose.',
      '',
      '## 2026-05-26 Section heading',
      '',
      'Section body without findings.',
    ].join('\n');
    expect(parseAuditLogText(text)).toEqual([]);
  });

  it('skips ### blocks without a Finding-ID', () => {
    const text = [
      '### Section-like heading',
      '',
      'Just prose, no fields.',
      '',
      '### Real finding',
      '',
      'Finding-ID: AUDIT-20260526-01',
      'Status:     open',
      '',
      'Body.',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.findingId).toBe('AUDIT-20260526-01');
  });

  it('captures heading + lineNumber + body verbatim', () => {
    const text = [
      '# Preamble',
      '',
      '### First finding heading',
      '',
      'Finding-ID: AUDIT-20260526-01',
      'Status:     open',
      'Severity:   medium',
      'Surface:    `plugins/foo.ts`',
      '',
      'Body paragraph one.',
      '',
      'Body paragraph two.',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(entry.heading).toBe('First finding heading');
    expect(entry.findingId).toBe('AUDIT-20260526-01');
    expect(entry.status).toBe('open');
    expect(entry.severity).toBe('medium');
    expect(entry.surface).toBe('`plugins/foo.ts`');
    expect(entry.lineNumber).toBe(3);
    expect(entry.body).toContain('Body paragraph one');
    expect(entry.body).toContain('Body paragraph two');
  });
});

describe('parseAuditLogText — Affects: single-line comma-separated form', () => {
  it('parses Affects: as comma-separated list when value on the same line', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Status:     open',
      'Affects:    anti-patterns.yaml#foo-id, clones.yaml#abc123, bare-id',
      '',
      'Body.',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.affects).toEqual([
      'anti-patterns.yaml#foo-id',
      'clones.yaml#abc123',
      'bare-id',
    ]);
  });

  it('trims whitespace + drops empty segments in comma-separated form', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Status:     open',
      'Affects:    foo,   bar  ,  ,baz',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.affects).toEqual(['foo', 'bar', 'baz']);
  });
});

describe('parseAuditLogText — Affects: multi-line bullet form', () => {
  it('parses a YAML-style bullet block as multi-line Affects', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Status:     open',
      'Affects:',
      '  - anti-patterns.yaml#ac-class-consumer',
      '  - adopter-manifests.yaml#legacy-button-import',
      '',
      'Body.',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.affects).toEqual([
      'anti-patterns.yaml#ac-class-consumer',
      'adopter-manifests.yaml#legacy-button-import',
    ]);
  });

  it('terminates the bullet block at a blank line (subsequent prose is body)', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Status:     open',
      'Affects:',
      '  - first',
      '  - second',
      '',
      'Body text.',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.affects).toEqual(['first', 'second']);
    expect(entries[0]?.body).toContain('Body text');
  });

  it('terminates the bullet block at the next Field: line', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Affects:',
      '  - first',
      '  - second',
      'Status:     open',
      'Severity:   high',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.affects).toEqual(['first', 'second']);
    expect(entries[0]?.status).toBe('open');
    expect(entries[0]?.severity).toBe('high');
  });

  it('tolerates any indentation depth on bullets', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Status:     open',
      'Affects:',
      '- no-indent',
      '   - three-spaces',
      '      - six-spaces',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.affects).toEqual(['no-indent', 'three-spaces', 'six-spaces']);
  });
});

describe('parseAuditLogText — Provenance: field', () => {
  it('captures Provenance: value when present', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Status:     open',
      'Provenance: external-auditor (claude-opus-4)',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.provenance).toBe('external-auditor (claude-opus-4)');
  });

  it('omits provenance when field absent', () => {
    const text = [
      '### F',
      'Finding-ID: AUDIT-1',
      'Status:     open',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries[0]?.provenance).toBeUndefined();
  });
});

describe('parseAuditLogText — multiple entries', () => {
  it('parses every finding in the document independently', () => {
    const text = [
      '### First',
      'Finding-ID: AUDIT-1',
      'Status:     fixed-abc1234',
      '',
      '### Second (section, no finding-id)',
      'Just narrative.',
      '',
      '### Third',
      'Finding-ID: AUDIT-3',
      'Status:     open',
      'Affects:',
      '  - foo',
      '',
      '### Fourth',
      'Finding-ID: AUDIT-4',
      'Status:     verified-2026-05-25',
    ].join('\n');
    const entries = parseAuditLogText(text);
    expect(entries.map((e) => e.findingId)).toEqual([
      'AUDIT-1',
      'AUDIT-3',
      'AUDIT-4',
    ]);
    expect(entries[1]?.affects).toEqual(['foo']);
  });
});

describe('parseAuditLogFile', () => {
  it('returns empty entries when the audit-log file is missing', async () => {
    const root = mkTmp();
    try {
      const log = await parseAuditLogFile(join(root, 'no-such-file.md'));
      expect(log.entries).toEqual([]);
      expect(log.sourcePath).toContain('no-such-file.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('parses an audit-log markdown file from disk', async () => {
    const root = mkTmp();
    try {
      const path = join(root, 'audit-log.md');
      writeFileSync(
        path,
        [
          '### Finding',
          'Finding-ID: AUDIT-20260526-01',
          'Status:     open',
          'Affects:',
          '  - anti-patterns.yaml#foo',
        ].join('\n'),
        'utf8',
      );
      const log = await parseAuditLogFile(path);
      expect(log.sourcePath).toBe(path);
      expect(log.entries).toHaveLength(1);
      expect(log.entries[0]?.affects).toEqual(['anti-patterns.yaml#foo']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('citation helpers', () => {
  it('citationEntryId strips the registry prefix when present', () => {
    expect(citationEntryId('anti-patterns.yaml#foo-id')).toBe('foo-id');
  });

  it('citationEntryId passes through bare ids', () => {
    expect(citationEntryId('bare-id')).toBe('bare-id');
  });

  it('citationRegistry extracts the registry prefix when present', () => {
    expect(citationRegistry('clones.yaml#abc')).toBe('clones.yaml');
  });

  it('citationRegistry returns null for bare ids', () => {
    expect(citationRegistry('bare-id')).toBeNull();
  });
});

describe('cross-reference navigation', () => {
  const sampleLog = parseAuditLogText(
    [
      '### A',
      'Finding-ID: AUDIT-1',
      'Status:     open',
      'Affects:',
      '  - anti-patterns.yaml#ac-class-consumer',
      '  - clones.yaml#abc',
      '',
      '### B',
      'Finding-ID: AUDIT-2',
      'Status:     fixed-deadbeef',
      'Affects:    anti-patterns.yaml#ac-class-consumer',
      '',
      '### C',
      'Finding-ID: AUDIT-3',
      'Status:     open',
      'Affects:    bare-id',
    ].join('\n'),
  );
  const log = { sourcePath: '/synth.md', entries: sampleLog };

  it('findAuditEntriesAffecting: returns all entries citing the given catalog id', () => {
    const matches = findAuditEntriesAffecting(log, 'ac-class-consumer');
    expect(matches.map((e) => e.findingId)).toEqual(['AUDIT-1', 'AUDIT-2']);
  });

  it('findAuditEntriesAffecting: registryFile filter restricts the matches', () => {
    const matches = findAuditEntriesAffecting(log, 'ac-class-consumer', 'anti-patterns.yaml');
    expect(matches.map((e) => e.findingId)).toEqual(['AUDIT-1', 'AUDIT-2']);
  });

  it('findAuditEntriesAffecting: registryFile filter drops mismatched registries', () => {
    const matches = findAuditEntriesAffecting(log, 'ac-class-consumer', 'clones.yaml');
    expect(matches).toEqual([]);
  });

  it('findAuditEntriesAffecting: matches bare-id citations regardless of registry filter', () => {
    const matches = findAuditEntriesAffecting(log, 'bare-id', 'anti-patterns.yaml');
    expect(matches.map((e) => e.findingId)).toEqual(['AUDIT-3']);
  });

  it('findAuditEntriesAffecting: returns empty when no match', () => {
    const matches = findAuditEntriesAffecting(log, 'never-referenced');
    expect(matches).toEqual([]);
  });

  it('findCatalogEntriesAffectedBy: returns the affect list for a known finding', () => {
    const citations = findCatalogEntriesAffectedBy(log, 'AUDIT-1');
    expect(citations).toEqual([
      'anti-patterns.yaml#ac-class-consumer',
      'clones.yaml#abc',
    ]);
  });

  it('findCatalogEntriesAffectedBy: returns empty when the finding-id is unknown', () => {
    expect(findCatalogEntriesAffectedBy(log, 'AUDIT-not-a-real-id')).toEqual([]);
  });
});

describe('auditFindingIdSet', () => {
  it('returns a Set of every finding-id in the parsed log', () => {
    const entries = parseAuditLogText(
      [
        '### A',
        'Finding-ID: AUDIT-1',
        'Status: open',
        '',
        '### B',
        'Finding-ID: AUDIT-2',
        'Status: open',
      ].join('\n'),
    );
    const set = auditFindingIdSet({ sourcePath: '', entries });
    expect(set.size).toBe(2);
    expect(set.has('AUDIT-1')).toBe(true);
    expect(set.has('AUDIT-2')).toBe(true);
    expect(set.has('AUDIT-other')).toBe(false);
  });
});
