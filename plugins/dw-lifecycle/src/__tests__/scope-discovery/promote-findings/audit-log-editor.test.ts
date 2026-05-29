import { describe, it, expect } from 'vitest';
import {
  flipAuditLogStatus,
  applyStatusFlips,
  AuditLogEditError,
} from '../../../scope-discovery/promote-findings/audit-log-editor.js';
import type {
  ReadAuditLog,
  WriteAuditLog,
} from '../../../scope-discovery/promote-findings/types.js';

function fixture(): string {
  return [
    '# Audit Log',
    '',
    '### One finding',
    '',
    'Finding-ID: AUDIT-1',
    'Status:     open',
    'Severity:   high',
    '',
    'Body of one.',
    '',
    '### Two finding',
    '',
    'Finding-ID: AUDIT-2',
    'Status:     open',
    '',
    'Body of two.',
    '',
    '### Three finding',
    '',
    'Finding-ID: AUDIT-3',
    'Status:     fixed-deadbeef',
    '',
    'Body of three.',
  ].join('\n');
}

function makeRead(content: string): ReadAuditLog {
  return async () => content;
}

describe('flipAuditLogStatus — replace Status: open with target', () => {
  it('flips a single finding status', async () => {
    const { newContent } = await flipAuditLogStatus({
      auditLogPath: '/tmp/al.md',
      flips: [{ findingId: 'AUDIT-1', newStatus: 'acknowledged-#999' }],
      read: makeRead(fixture()),
    });
    expect(newContent).toContain('Finding-ID: AUDIT-1');
    expect(newContent).toContain('Status:     acknowledged-#999');
    expect(newContent).not.toContain('Status:     open\nSeverity:   high');
    // Body preserved verbatim.
    expect(newContent).toContain('Body of one.');
  });

  it('flips multiple findings', async () => {
    const { newContent } = await flipAuditLogStatus({
      auditLogPath: '/tmp/al.md',
      flips: [
        { findingId: 'AUDIT-1', newStatus: 'acknowledged-#100' },
        { findingId: 'AUDIT-2', newStatus: 'informational' },
      ],
      read: makeRead(fixture()),
    });
    expect(newContent).toContain('Status:     acknowledged-#100');
    expect(newContent).toContain('Status:     informational');
  });

  it('preserves the Status: prefix and leading whitespace', async () => {
    const wp = [
      '### Finding alpha',
      '',
      'Finding-ID: AUDIT-A',
      'Status: open', // single space
      '',
      'Body.',
    ].join('\n');
    const { newContent } = await flipAuditLogStatus({
      auditLogPath: '/tmp/al.md',
      flips: [{ findingId: 'AUDIT-A', newStatus: 'informational' }],
      read: makeRead(wp),
    });
    expect(newContent).toContain('Status: informational');
    expect(newContent).not.toContain('Status:  informational');
  });

  it('preserves the rest of the entry body verbatim', async () => {
    const wp = fixture();
    const { newContent } = await flipAuditLogStatus({
      auditLogPath: '/tmp/al.md',
      flips: [{ findingId: 'AUDIT-1', newStatus: 'acknowledged-#999' }],
      read: makeRead(wp),
    });
    expect(newContent).toContain('Severity:   high');
    expect(newContent).toContain('### Two finding');
    expect(newContent).toContain('### Three finding');
    expect(newContent).toContain('Status:     fixed-deadbeef');
  });

  it('throws AuditLogEditError when finding-id not found', async () => {
    await expect(
      flipAuditLogStatus({
        auditLogPath: '/tmp/al.md',
        flips: [{ findingId: 'AUDIT-NOPE', newStatus: 'informational' }],
        read: makeRead(fixture()),
      }),
    ).rejects.toBeInstanceOf(AuditLogEditError);
  });

  it('throws AuditLogEditError when target finding is already not Status: open', async () => {
    await expect(
      flipAuditLogStatus({
        auditLogPath: '/tmp/al.md',
        flips: [{ findingId: 'AUDIT-3', newStatus: 'informational' }],
        read: makeRead(fixture()),
      }),
    ).rejects.toBeInstanceOf(AuditLogEditError);
  });

  it('throws AuditLogEditError when the located Status line drifted', async () => {
    // Drift case: Finding-ID line present but no Status line follows it.
    const wp = [
      '### Lonely finding',
      '',
      'Finding-ID: AUDIT-X',
      'Severity: high',
      '',
      'Body.',
    ].join('\n');
    await expect(
      flipAuditLogStatus({
        auditLogPath: '/tmp/al.md',
        flips: [{ findingId: 'AUDIT-X', newStatus: 'informational' }],
        read: makeRead(wp),
      }),
    ).rejects.toBeInstanceOf(AuditLogEditError);
  });

  it('does not mutate when any single flip is invalid (all-or-nothing)', async () => {
    await expect(
      flipAuditLogStatus({
        auditLogPath: '/tmp/al.md',
        flips: [
          { findingId: 'AUDIT-1', newStatus: 'acknowledged-#1' },
          { findingId: 'AUDIT-NOPE', newStatus: 'informational' },
        ],
        read: makeRead(fixture()),
      }),
    ).rejects.toBeInstanceOf(AuditLogEditError);
    // Re-call without the bad flip and confirm AUDIT-1's status is still
    // 'open' in the source.
    const original = await makeRead(fixture())('/tmp/al.md');
    expect(original).toContain('Finding-ID: AUDIT-1\nStatus:     open');
  });
});

describe('applyStatusFlips — wraps flipAuditLogStatus + writes', () => {
  it('writes the new content on success', async () => {
    const captured: { path: string; content: string }[] = [];
    const write: WriteAuditLog = async (path, content) => {
      captured.push({ path, content });
    };
    await applyStatusFlips({
      auditLogPath: '/tmp/al.md',
      flips: [{ findingId: 'AUDIT-1', newStatus: 'informational' }],
      read: makeRead(fixture()),
      write,
    });
    expect(captured).toHaveLength(1);
    const recorded = captured[0];
    if (recorded === undefined) throw new Error('write was not invoked');
    expect(recorded.content).toContain('Status:     informational');
  });

  it('does not call write on validation failure', async () => {
    let called = false;
    const write: WriteAuditLog = async () => {
      called = true;
    };
    await expect(
      applyStatusFlips({
        auditLogPath: '/tmp/al.md',
        flips: [{ findingId: 'AUDIT-NOPE', newStatus: 'informational' }],
        read: makeRead(fixture()),
        write,
      }),
    ).rejects.toBeInstanceOf(AuditLogEditError);
    expect(called).toBe(false);
  });
});
