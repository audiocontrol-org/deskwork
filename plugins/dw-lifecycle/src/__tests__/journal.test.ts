// src/__tests__/journal.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJournalEntry } from '../journal.js';

describe('journal', () => {
  let tmp: string;
  let path: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-journal-'));
    path = join(tmp, 'DEVELOPMENT-NOTES.md');
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('creates the journal file when missing', () => {
    appendJournalEntry(path, '## 2026-04-29: Test\n\nGoal: testing.\n');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('## 2026-04-29: Test');
  });

  it('appends below existing content with separator', () => {
    writeFileSync(path, '# Development Notes\n\nExisting content.\n', 'utf8');
    appendJournalEntry(path, '## 2026-04-29: New entry\n\nGoal: stuff.\n');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('Existing content.');
    expect(content).toContain('## 2026-04-29: New entry');
    expect(content.indexOf('Existing content')).toBeLessThan(content.indexOf('New entry'));
  });

  it('does not double-append the same entry text', () => {
    writeFileSync(path, '# Notes\n\n## 2026-04-29: Foo\n\nGoal: x.\n', 'utf8');
    appendJournalEntry(path, '## 2026-04-29: Foo\n\nGoal: x.\n');
    const content = readFileSync(path, 'utf8');
    const occurrences = content.split('## 2026-04-29: Foo').length - 1;
    expect(occurrences).toBe(1);
  });

  it('appends when an existing heading is a superstring of the new fingerprint', () => {
    writeFileSync(path, '# Notes\n\n## 2026-04-29: Phase 4 — start (continued)\n\nGoal: x.\n', 'utf8');
    appendJournalEntry(path, '## 2026-04-29: Phase 4 — start\n\nGoal: y.\n');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('## 2026-04-29: Phase 4 — start (continued)');
    expect(content).toContain('## 2026-04-29: Phase 4 — start\n');
    expect(content).toContain('Goal: y.');
    expect(content.indexOf('(continued)')).toBeLessThan(content.indexOf('Goal: y.'));
  });

  it('appends when the fingerprint appears only inside a previous entry body', () => {
    writeFileSync(
      path,
      '# Notes\n\n## 2026-04-29: Earlier\n\nWe quoted "## 2026-04-29: Foo" in this body.\n',
      'utf8',
    );
    appendJournalEntry(path, '## 2026-04-29: Foo\n\nReal new entry.\n');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('Real new entry.');
    const exactHeadingLines = content
      .split('\n')
      .filter((line) => line === '## 2026-04-29: Foo');
    expect(exactHeadingLines.length).toBe(1);
  });
});
