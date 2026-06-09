// T023 (US4, 008) — the one-time slush backfill: existing acknowledged-slush-pile
// audit-log entries become migrated-finding backlog items, and each entry's
// status is rewritten to `migrated-to-backlog <task-id>` (FR-021). The non-slush
// portion of the audit-log stays byte-unchanged (FR-025); HIGHs are never
// migrated (FR-018); the backfill is idempotent. Exercised against the REAL
// backlog binary with the committed fixture audit-log.

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { backfillSlush } from '../../src/backlog/slush-migrate.js';
import { tmpBacklog, fixturePath } from './helpers.js';

const SLUG = '008-backlog-surface';
function auditLog(): string {
  return readFileSync(fixturePath('audit-log.md'), 'utf8');
}
function taskFiles(dir: string): string[] {
  return readdirSync(join(dir, 'backlog', 'tasks'))
    .map((f) => readFileSync(join(dir, 'backlog', 'tasks', f), 'utf8'));
}

describe('backfillSlush (US4, T023)', () => {
  it('dry-run reports the parked set and writes nothing', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const res = backfillSlush({ auditLogText: auditLog(), backend, featureSlug: SLUG, apply: false });
    expect(res.planned).toEqual(['AUDIT-20260608-01', 'AUDIT-20260608-02']);
    expect(res.newAuditLogText).toBe(auditLog());
    expect(backend.list()).toHaveLength(0);
  });

  it('apply creates one migrated-finding item per acknowledged-slush-pile entry (severity→priority, provenance, ref)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const res = backfillSlush({ auditLogText: auditLog(), backend, featureSlug: SLUG, apply: true });
    expect(res.result?.migrated).toHaveLength(2);

    const items = backend.list();
    expect(items).toHaveLength(2);
    for (const it of items) {
      expect(it.type).toBe('migrated-finding');
      expect(it.labels).toContain(`feature:${SLUG}`);
    }
    const med = items.find((i) => i.labels.includes('finding:AUDIT-20260608-01'));
    expect(med).toBeDefined();
    expect(med!.refs).toContain(`audit:${SLUG}:AUDIT-20260608-01`);

    // priority carried into the task-file frontmatter (medium for the MEDIUM, low for the LOW)
    const content = taskFiles(dir).join('\n---\n');
    expect(content).toMatch(/priority:\s*medium/i);
    expect(content).toMatch(/priority:\s*low/i);
  });

  it('rewrites each migrated entry to migrated-to-backlog <task-id>; HIGH stays open; non-slush portion byte-unchanged', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const res = backfillSlush({ auditLogText: auditLog(), backend, featureSlug: SLUG, apply: true });
    const out = res.newAuditLogText;

    // The two parked entries now carry the migrated disposition (no acknowledged-slush-pile left).
    expect(out).toMatch(/Status: migrated-to-backlog TASK-\d+/);
    // No Status line still carries the parked disposition (intro prose may mention it).
    expect(out).not.toMatch(/^Status:\s*acknowledged-slush-pile/im);
    // HIGH finding (AUDIT-20260608-03) is never migrated — still open.
    expect(out).toMatch(/### AUDIT-20260608-03[\s\S]*?Status: open/);
    // The non-barrage convergence ledger section is untouched (FR-025).
    expect(out).toContain('### AUDIT-20260530-01');
    expect(out).toContain('Status: fixed-abc1234');
  });

  it('is idempotent — a second backfill over the migrated text creates zero new items (FR-021)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const first = backfillSlush({ auditLogText: auditLog(), backend, featureSlug: SLUG, apply: true });
    const second = backfillSlush({ auditLogText: first.newAuditLogText, backend, featureSlug: SLUG, apply: true });
    expect(second.planned).toHaveLength(0);
    expect(backend.list()).toHaveLength(2);
  });
});

describe('stackctl backlog import-slush verb wiring (US4, T024)', () => {
  function setup(): { dir: string; auditFile: string } {
    const dir = tmpBacklog();
    const auditFile = join(mkdtempSync(join(tmpdir(), 'backlog-audit-')), 'audit-log.md');
    copyFileSync(fixturePath('audit-log.md'), auditFile);
    return { dir, auditFile };
  }
  function runSlush(args: string[], dir: string, auditFile: string) {
    return runCli(['backlog', 'import-slush', '--feature', SLUG, ...args], {
      env: { STACKCTL_BACKLOG_DIR: dir, STACKCTL_AUDIT_LOG_FILE: auditFile },
    });
  }

  it('dry-run reports the set and writes nothing; --apply migrates + rewrites the audit-log', () => {
    const { dir, auditFile } = setup();
    const before = readFileSync(auditFile, 'utf8');

    const dry = runSlush([], dir, auditFile);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/would migrate 2/);
    expect(createBacklogBackend({ cwd: dir }).list()).toHaveLength(0);
    expect(readFileSync(auditFile, 'utf8')).toBe(before);

    const applied = runSlush(['--apply'], dir, auditFile);
    expect(applied.status).toBe(0);
    expect(createBacklogBackend({ cwd: dir }).list()).toHaveLength(2);
    expect(readFileSync(auditFile, 'utf8')).toMatch(/Status: migrated-to-backlog TASK-\d+/);
  });

  it('an unresolvable feature → exit 2', () => {
    const dir = tmpBacklog();
    const r = runCli(['backlog', 'import-slush', '--feature', 'no-such-feature-xyz'], {
      env: { STACKCTL_BACKLOG_DIR: dir },
    });
    expect(r.status).toBe(2);
  });
});
