import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  walkAuditLogs,
  __testing,
} from '../close-shipped/audit-log-walker.js';
import { defaultConfig } from '../config.js';
import type { RunGit } from '../close-shipped/types.js';

function makeProject(): {
  readonly root: string;
  readonly slugDir: string;
  readonly auditLogPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'close-shipped-al-'));
  const slugDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'sample');
  mkdirSync(slugDir, { recursive: true });
  return { root, slugDir, auditLogPath: join(slugDir, 'audit-log.md') };
}

function configWithVersion(version = '1.0') {
  const cfg = defaultConfig();
  return {
    ...cfg,
    docs: { ...cfg.docs, knownVersions: [version] },
  };
}

function mockGit(reachable: ReadonlySet<string>): RunGit {
  return (args) => {
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      const sha = args[2] ?? '';
      const ref = args[3] ?? '';
      if (ref === 'vTO' && reachable.has(sha)) return '';
      if (ref === 'vFROM') throw new Error('not-ancestor');
      throw new Error('not-ancestor');
    }
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  };
}

describe('audit-log status-pattern regex', () => {
  it('matches Status: fixed-<sha>', () => {
    const m = __testing.STATUS_FIXED_PATTERN.exec(
      'Status:     fixed-d4ca597\n',
    );
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe('d4ca597');
  });

  it('does not match Status: withdrawn-...', () => {
    const m = __testing.STATUS_FIXED_PATTERN.exec(
      'Status:     withdrawn-2026-05-25\n',
    );
    expect(m).toBeNull();
  });
});

describe('extractIssueFromEntry', () => {
  it('prefers Closes #N over plain #N', () => {
    const text = 'see #42 elsewhere\nCloses #100\n';
    expect(__testing.extractIssueFromEntry(text)).toBe(100);
  });

  it('returns null when no issue reference present', () => {
    expect(__testing.extractIssueFromEntry('no refs here')).toBeNull();
  });

  it('matches acknowledged-#NNN audit-log shorthand', () => {
    expect(__testing.extractIssueFromEntry('Status: acknowledged-#285')).toBe(
      285,
    );
  });
});

describe('walkAuditLogs', () => {
  it('returns empty array when the docs root does not exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'close-shipped-al-empty-'));
    const findings = walkAuditLogs({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: () => '',
    });
    expect(findings).toEqual([]);
  });

  it('finds fixed-<sha> entries with reachable SHAs and associates issues', () => {
    const { root, auditLogPath } = makeProject();
    writeFileSync(
      auditLogPath,
      [
        '# Audit Log',
        '',
        '### A finding',
        '',
        'Finding-ID: AUDIT-001',
        'Status:     fixed-abc1234',
        '',
        'Closes #42 once verified.',
        '',
        '### Another finding (outside range)',
        '',
        'Finding-ID: AUDIT-002',
        'Status:     fixed-deadbee',
        '',
        'Closes #99 later.',
        '',
      ].join('\n'),
    );
    const findings = walkAuditLogs({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: mockGit(new Set(['abc1234'])),
    });
    expect(findings.length).toBe(1);
    const first = findings[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.source).toBe('audit-log');
    expect(first.sha).toBe('abc1234');
    expect(first.issueNumber).toBe(42);
    expect(first.findingId).toBe('AUDIT-001');
    expect(first.auditLogPath).toBe(auditLogPath);
  });

  it('emits null issueNumber for an entry with no recoverable issue reference', () => {
    const { root, auditLogPath } = makeProject();
    writeFileSync(
      auditLogPath,
      [
        '### Orphan entry',
        '',
        'Finding-ID: AUDIT-003',
        'Status:     fixed-abc1234',
        '',
        'No issue numbers in the body.',
      ].join('\n'),
    );
    const findings = walkAuditLogs({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: mockGit(new Set(['abc1234'])),
    });
    expect(findings.length).toBe(1);
    expect(findings[0]?.issueNumber).toBeNull();
  });

  it('skips entries where the SHA is not reachable in the range', () => {
    const { root, auditLogPath } = makeProject();
    writeFileSync(
      auditLogPath,
      [
        '### A finding',
        '',
        'Finding-ID: AUDIT-001',
        'Status:     fixed-cafefee',
        '',
        'Closes #42.',
      ].join('\n'),
    );
    const findings = walkAuditLogs({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: mockGit(new Set<string>()),
    });
    expect(findings).toEqual([]);
  });

  it('walks audit-logs across multiple feature slug dirs', () => {
    const root = mkdtempSync(join(tmpdir(), 'close-shipped-al-multi-'));
    for (const slug of ['featA', 'featB']) {
      const dir = join(root, 'docs', '1.0', '001-IN-PROGRESS', slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'audit-log.md'),
        [
          `### Finding for ${slug}`,
          '',
          `Finding-ID: AUDIT-${slug}-1`,
          `Status:     fixed-aaaa${slug === 'featA' ? '111' : '222'}`,
          '',
          `Closes #${slug === 'featA' ? '10' : '20'}.`,
        ].join('\n'),
      );
    }
    const findings = walkAuditLogs({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: mockGit(new Set(['aaaa111', 'aaaa222'])),
    });
    const issues = findings.map((f) => f.issueNumber).sort();
    expect(issues).toEqual([10, 20]);
  });
});
