// specs/014 US8 (TASK-5 / AUDIT-20260609-22): backlog per-file fault
// isolation. Today a single malformed-frontmatter task file throws out
// of parseYaml and aborts list/exists/imports with a raw exit-1 stack
// trace — one corrupted file takes down the whole store.
//
// Contract (Clarification 2026-06-11; cli-contracts §backlog; research
// R8 — skip-reads / fail-imports split):
//   - `list` (read path, availability): warns on stderr naming the
//     file, lists healthy items, exit 0.
//   - `exists` / import idempotency (write-adjacent, safety): a
//     POSITIVE answer is decidable regardless of malformed files —
//     when the ref is found among healthy items, exists returns true
//     (nothing would be created; no duplicate is possible). Only when
//     the answer would otherwise be "absent" with malformed files
//     present does exists throw BacklogError naming the file (existing
//     dispatcher mapping → exit 2) — a skipped file could hide the ref
//     an idempotency check needs and cause duplicate creation
//     (AUDIT-20260611-06).
//   - All-files-malformed store: list = zero items + warnings
//     (distinguishable from clean-empty); imports fail loud.
//   - Never an unhandled stack trace with exit 1.

import { describe, expect, it } from 'vitest';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, tmpBacklog } from '../../tests/backlog/helpers.js';
import { BacklogError, createBacklogBackend } from '../backlog/backend.js';

const MALFORMED_NAME = 'task-99 - Broken.md';
const MALFORMED_BODY = [
  '---',
  'id: TASK-99',
  'labels: [unclosed',
  '---',
  '',
  'Body of the broken task.',
  '',
].join('\n');

function plantMalformed(root: string): string {
  const tasksDir = join(root, 'backlog', 'tasks');
  mkdirSync(tasksDir, { recursive: true });
  const path = join(tasksDir, MALFORMED_NAME);
  writeFileSync(path, MALFORMED_BODY, 'utf8');
  return path;
}

function collectWarnings(): { warn: (line: string) => void; text: () => string } {
  const lines: string[] = [];
  return { warn: (line) => lines.push(line), text: () => lines.join('') };
}

describe('US8 — backlog list skips malformed task files with a warning', () => {
  it('verb: lists healthy items, warns naming the file, exit 0', () => {
    const root = tmpBacklog();
    const backend = createBacklogBackend({ cwd: root });
    backend.create({ title: 'A healthy item', labels: ['type:bug'] });
    plantMalformed(root);

    const r = runCli(['backlog', 'list'], { env: { STACKCTL_BACKLOG_DIR: root } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('A healthy item');
    expect(r.stdout).toMatch(/1 item\b/);
    expect(r.stderr).toMatch(/WARNING/);
    expect(r.stderr).toContain(MALFORMED_NAME);
  });

  it('library: all-files-malformed store lists zero items WITH warnings (distinguishable from clean-empty)', () => {
    const root = tmpBacklog();
    plantMalformed(root);
    const { warn, text } = collectWarnings();
    const backend = createBacklogBackend({ cwd: root, warn });

    expect(backend.list()).toEqual([]);
    expect(text()).toContain(MALFORMED_NAME);

    // A genuinely clean-empty store produces zero items AND zero warnings.
    const cleanRoot = tmpBacklog();
    const clean = collectWarnings();
    const cleanBackend = createBacklogBackend({ cwd: cleanRoot, warn: clean.warn });
    expect(cleanBackend.list()).toEqual([]);
    expect(clean.text()).toBe('');
  });
});

describe('US8 — integrity paths fail loud on a malformed task file', () => {
  it('exists() returns true when the ref is present among healthy items despite a malformed file (AUDIT-20260611-06: the positive answer is decidable)', () => {
    const root = tmpBacklog();
    const backend = createBacklogBackend({ cwd: root });
    backend.create({ title: 'A healthy item', labels: ['type:bug'], refs: ['gh-1'] });
    plantMalformed(root);

    // The idempotency check succeeds: nothing would be created, no
    // duplicate is possible — the malformed file cannot change a
    // positive answer.
    expect(backend.exists('gh-1')).toBe(true);
  });

  it('exists() throws BacklogError naming the file when the ref is absent (a skip could hide the idempotency ref)', () => {
    const root = tmpBacklog();
    const backend = createBacklogBackend({ cwd: root });
    backend.create({ title: 'A healthy item', labels: ['type:bug'], refs: ['gh-1'] });
    const malformedPath = plantMalformed(root);

    expect(() => backend.exists('absent-ref')).toThrowError(BacklogError);
    expect(() => backend.exists('absent-ref')).toThrowError(
      new RegExp(MALFORMED_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    // Naming the full path (or at least the file) is the remediation surface.
    try {
      backend.exists('absent-ref');
    } catch (err) {
      expect(String(err)).toContain(MALFORMED_NAME);
      expect(malformedPath).toContain(MALFORMED_NAME);
    }
  });

  it('import-slush idempotency path: loud named-file error, exit 2, zero items created, audit-log untouched', () => {
    const root = tmpBacklog();
    plantMalformed(root);

    // Audit-log with a parked entry the backfill would migrate.
    const auditLog = join(root, 'audit-log.md');
    const auditBody = [
      '# Audit Log',
      '',
      '## 2026-06-07 — audit-barrage lift (20260607T100000000Z-s-after_clarify)',
      '',
      '### Parked finding',
      '',
      'Finding-ID: AUDIT-20260607-01',
      'Status:     acknowledged-slush-pile-2026-06-07',
      'Severity:   low',
      'Surface:    spec.md:1',
      '',
      'Body.',
      '',
    ].join('\n');
    writeFileSync(auditLog, auditBody, 'utf8');

    const tasksBefore = readdirSync(join(root, 'backlog', 'tasks'));
    const r = runCli(['backlog', 'import-slush', '--feature', 's', '--apply'], {
      env: { STACKCTL_BACKLOG_DIR: root, STACKCTL_AUDIT_LOG_FILE: auditLog },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(MALFORMED_NAME);
    // Zero duplicates / zero new items created.
    expect(readdirSync(join(root, 'backlog', 'tasks'))).toEqual(tasksBefore);
    // The audit-log disposition was NOT rewritten.
    expect(readFileSync(auditLog, 'utf8')).toContain('acknowledged-slush-pile-2026-06-07');
  });
});
