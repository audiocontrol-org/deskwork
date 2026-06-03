import { describe, it, expect } from 'vitest';
import {
  findLedger,
  parseLedgerContent,
  parseLedgerFromWorkplan,
  serializeLedger,
  wrapLedgerBlock,
  compareIds,
  isIdInRanges,
  type Ledger,
} from '../../../scope-discovery/workplan-archive/ledger.js';

describe('findLedger — locator', () => {
  it('returns null when no ledger annotation is present', () => {
    const body = '# Workplan\n\n## Phase 1\n';
    expect(findLedger(body)).toBeNull();
  });

  it('locates the canonical ledger block', () => {
    const body = [
      '# Workplan',
      '',
      '<!-- workplan-archive-ledger',
      'archived-phases: 1-5',
      'archived-fix-tasks: 5.1-5.10',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 5.11',
      '-->',
      '',
      '## Phase 6',
    ].join('\n');
    const located = findLedger(body);
    expect(located).not.toBeNull();
    expect(located!.content).toContain('archived-phases: 1-5');
    expect(located!.content).toContain('next-fix-task-id: 5.11');
  });
});

describe('parseLedgerContent — happy paths', () => {
  it('parses the canonical example from the 2026-06-03 manual archive', () => {
    const content = [
      'archived-phases: 1-5, 9-10, 13-14, 16-19, 21-23',
      'archived-fix-tasks: 5.1-5.123',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 5.124',
      'note: archived 2026-06-03 via scripts/archive-phases-onetime.ts',
    ].join('\n');
    const ledger = parseLedgerContent(content);
    expect(ledger.archivedPhases.length).toBe(5);
    expect(ledger.archivedPhases[0]).toEqual({ start: '1', end: '5' });
    expect(ledger.archivedPhases[1]).toEqual({ start: '9', end: '10' });
    expect(ledger.archivedFixTasks.length).toBe(1);
    expect(ledger.archivedFixTasks[0]).toEqual({ start: '5.1', end: '5.123' });
    expect(ledger.archiveFile).toBe('workplan-archive.md');
    expect(ledger.nextFixTaskId).toBe('5.124');
    expect(ledger.note).toContain('2026-06-03');
  });

  it('treats `none` as an empty range list', () => {
    const content = [
      'archived-phases: 1',
      'archived-fix-tasks: none',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 1.1',
    ].join('\n');
    const ledger = parseLedgerContent(content);
    expect(ledger.archivedFixTasks).toEqual([]);
  });

  it('accepts singleton ranges (no hyphen)', () => {
    const content = [
      'archived-phases: 7',
      'archived-fix-tasks: 7.3',
      'archive-file: workplan-archive.md',
      'next-fix-task-id: 7.4',
    ].join('\n');
    const ledger = parseLedgerContent(content);
    expect(ledger.archivedPhases).toEqual([{ start: '7' }]);
    expect(ledger.archivedFixTasks).toEqual([{ start: '7.3' }]);
  });

  it('preserves `note` when present', () => {
    const content = [
      'archived-phases: 1',
      'archived-fix-tasks: none',
      'archive-file: a.md',
      'next-fix-task-id: 1.1',
      'note: free-form text',
    ].join('\n');
    expect(parseLedgerContent(content).note).toBe('free-form text');
  });

  it('omits `note` when absent', () => {
    const content = [
      'archived-phases: 1',
      'archived-fix-tasks: none',
      'archive-file: a.md',
      'next-fix-task-id: 1.1',
    ].join('\n');
    expect(parseLedgerContent(content).note).toBeUndefined();
  });
});

describe('parseLedgerContent — error paths', () => {
  it('throws on missing required field', () => {
    const content = [
      'archived-phases: 1',
      'archive-file: a.md',
      'next-fix-task-id: 1.1',
    ].join('\n');
    expect(() => parseLedgerContent(content)).toThrow(/archived-fix-tasks/);
  });

  it('throws on malformed line (no colon)', () => {
    const content = [
      'archived-phases 1',
      'archived-fix-tasks: none',
      'archive-file: a.md',
      'next-fix-task-id: 1.1',
    ].join('\n');
    expect(() => parseLedgerContent(content)).toThrow(/no colon/);
  });

  it('throws on malformed range (trailing hyphen)', () => {
    const content = [
      'archived-phases: 1-',
      'archived-fix-tasks: none',
      'archive-file: a.md',
      'next-fix-task-id: 1.1',
    ].join('\n');
    expect(() => parseLedgerContent(content)).toThrow(/malformed range/);
  });
});

describe('serializeLedger — round-trip', () => {
  it('round-trips the canonical example', () => {
    const original: Ledger = {
      archivedPhases: [
        { start: '1', end: '5' },
        { start: '9', end: '10' },
        { start: '13', end: '14' },
      ],
      archivedFixTasks: [{ start: '5.1', end: '5.123' }],
      archiveFile: 'workplan-archive.md',
      nextFixTaskId: '5.124',
      note: 'archived 2026-06-03',
    };
    const serialized = serializeLedger(original);
    const reparsed = parseLedgerContent(serialized);
    expect(reparsed).toEqual(original);
  });

  it('round-trips an empty fix-tasks ledger (no archived fix-tasks yet)', () => {
    const original: Ledger = {
      archivedPhases: [{ start: '1', end: '3' }],
      archivedFixTasks: [],
      archiveFile: 'workplan-archive.md',
      nextFixTaskId: '1.1',
    };
    const reparsed = parseLedgerContent(serializeLedger(original));
    expect(reparsed.archivedFixTasks).toEqual([]);
  });

  it('round-trips through wrapLedgerBlock + findLedger', () => {
    const original: Ledger = {
      archivedPhases: [{ start: '1', end: '5' }],
      archivedFixTasks: [],
      archiveFile: 'workplan-archive.md',
      nextFixTaskId: '1.1',
    };
    const body = `# Workplan\n\n${wrapLedgerBlock(serializeLedger(original))}\n\n## Phase 6\n`;
    const reparsed = parseLedgerFromWorkplan(body);
    expect(reparsed).toEqual(original);
  });
});

describe('compareIds + isIdInRanges — auto-positioner support (AUDIT-86 fix)', () => {
  it('compareIds handles integer-only IDs', () => {
    expect(compareIds('5', '10')).toBeLessThan(0);
    expect(compareIds('10', '5')).toBeGreaterThan(0);
    expect(compareIds('5', '5')).toBe(0);
  });

  it('compareIds handles dotted-decimal IDs', () => {
    expect(compareIds('5.1', '5.10')).toBeLessThan(0);
    expect(compareIds('5.10', '5.2')).toBeGreaterThan(0);
    expect(compareIds('5.99', '5.99')).toBe(0);
    expect(compareIds('5.1', '6.1')).toBeLessThan(0);
  });

  it('isIdInRanges detects archived-range collisions', () => {
    const ranges = [
      { start: '5.1', end: '5.123' },
      { start: '6.1', end: '6.5' },
    ];
    expect(isIdInRanges('5.50', ranges)).toBe(true);
    expect(isIdInRanges('5.123', ranges)).toBe(true);
    expect(isIdInRanges('5.124', ranges)).toBe(false);
    expect(isIdInRanges('6.3', ranges)).toBe(true);
    expect(isIdInRanges('7.1', ranges)).toBe(false);
  });

  it('isIdInRanges handles singleton ranges', () => {
    expect(isIdInRanges('5.5', [{ start: '5.5' }])).toBe(true);
    expect(isIdInRanges('5.6', [{ start: '5.5' }])).toBe(false);
  });
});
