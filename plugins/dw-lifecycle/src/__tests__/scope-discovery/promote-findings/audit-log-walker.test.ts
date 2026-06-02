import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkOpenFindings } from '../../../scope-discovery/promote-findings/audit-log-walker.js';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'pf-walker-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function writeAuditLog(name: string, contents: string): string {
  const path = join(workDir, name);
  mkdirSync(workDir, { recursive: true });
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('walkOpenFindings — extracts Status: open entries from audit-log', () => {
  it('returns empty array when audit-log does not exist', async () => {
    const path = join(workDir, 'does-not-exist.md');
    const findings = await walkOpenFindings({
      auditLogPath: path,
      featureSlug: 'demo',
    });
    expect(findings).toEqual([]);
  });

  it('returns empty array when audit-log contains zero open entries', async () => {
    const path = writeAuditLog(
      'no-open.md',
      [
        '# Audit Log',
        '',
        '## 2026-05-29 Section',
        '',
        '### One finding',
        '',
        'Finding-ID: AUDIT-20260529-01',
        'Status:     fixed-deadbeef',
        'Severity:   high',
        '',
        'Body text.',
      ].join('\n'),
    );
    const findings = await walkOpenFindings({
      auditLogPath: path,
      featureSlug: 'demo',
    });
    expect(findings).toEqual([]);
  });

  it('returns one finding for a single Status: open entry', async () => {
    const path = writeAuditLog(
      'one-open.md',
      [
        '# Audit Log',
        '',
        '### The validator misses negative balances',
        '',
        'Finding-ID: AUDIT-20260529-02',
        'Status:     open',
        'Severity:   high',
        'Surface:    src/balance.ts:42',
        '',
        'Body of the finding.',
      ].join('\n'),
    );
    const findings = await walkOpenFindings({
      auditLogPath: path,
      featureSlug: 'demo',
    });
    expect(findings).toHaveLength(1);
    const first = findings[0];
    if (!first) throw new Error('expected at least one finding');
    expect(first.findingId).toBe('AUDIT-20260529-02');
    expect(first.heading).toBe('The validator misses negative balances');
    expect(first.severity).toBe('high');
    expect(first.surface).toBe('src/balance.ts:42');
    expect(first.auditLogPath).toBe(path);
    expect(first.lineNumber).toBeGreaterThan(0);
    expect(first.body).toContain('Body of the finding.');
  });

  it('returns only open entries from a mixed audit-log', async () => {
    const path = writeAuditLog(
      'mixed.md',
      [
        '# Audit Log',
        '',
        '### Open one',
        '',
        'Finding-ID: AUDIT-20260529-03',
        'Status: open',
        '',
        'Body one.',
        '',
        '### Fixed already',
        '',
        'Finding-ID: AUDIT-20260529-04',
        'Status: fixed-cafefade',
        '',
        'Body two.',
        '',
        '### Open two',
        '',
        'Finding-ID: AUDIT-20260529-05',
        'Status: open',
        '',
        'Body three.',
        '',
        '### Withdrawn',
        '',
        'Finding-ID: AUDIT-20260529-06',
        'Status: withdrawn-2026-05-28',
        '',
        'Body four.',
      ].join('\n'),
    );
    const findings = await walkOpenFindings({
      auditLogPath: path,
      featureSlug: 'demo',
    });
    expect(findings.map((f) => f.findingId)).toEqual([
      'AUDIT-20260529-03',
      'AUDIT-20260529-05',
    ]);
  });

  it('handles entries with missing optional fields (severity, surface)', async () => {
    const path = writeAuditLog(
      'minimal.md',
      [
        '### Bare-bones finding',
        '',
        'Finding-ID: AUDIT-20260529-07',
        'Status: open',
        '',
        'Body.',
      ].join('\n'),
    );
    const findings = await walkOpenFindings({
      auditLogPath: path,
      featureSlug: 'demo',
    });
    expect(findings).toHaveLength(1);
    const f = findings[0];
    if (!f) throw new Error('expected one finding');
    expect(f.severity).toBeUndefined();
    expect(f.surface).toBeUndefined();
  });

  it('accepts featureSlug informationally (no filtering on it in v1)', async () => {
    const path = writeAuditLog(
      'feature-arg.md',
      [
        '### A finding',
        '',
        'Finding-ID: AUDIT-20260529-08',
        'Status: open',
        '',
        'Body.',
      ].join('\n'),
    );
    const a = await walkOpenFindings({ auditLogPath: path, featureSlug: 'a' });
    const b = await walkOpenFindings({ auditLogPath: path, featureSlug: 'b' });
    expect(a.map((f) => f.findingId)).toEqual(b.map((f) => f.findingId));
  });
});
