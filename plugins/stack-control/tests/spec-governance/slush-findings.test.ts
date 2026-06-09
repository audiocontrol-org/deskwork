// Slush pile (ported from dw-lifecycle slush-remaining). The dampener DECISION
// (when to park — HIGH-quiet) is unchanged; 008 rewired the DESTINATION: a
// parked MEDIUM/LOW flip becomes a `migrated-finding` backlog item and its
// audit-log entry records `Status: migrated-to-backlog <task-id>` (NOT
// `acknowledged-slush-pile`). HIGHs are NEVER slushed. These tests cover the
// dampener-engagement + scope semantics through the rewired verb; the backlog
// destination + --burn-down-removed are covered in tests/backlog/.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { tmpBacklog } from '../backlog/helpers.js';

function entry(id: string, sev: 'high' | 'medium' | 'low', status = 'open'): string {
  return (
    `### Finding ${id}\n\n` +
    `Finding-ID: AUDIT-20260607-${id}\nStatus:     ${status}\nSeverity:   ${sev}\n` +
    `Surface:    spec.md:1\n\nBody.\n`
  );
}
function section(runId: string, entries: string[]): string {
  return `## 2026-06-07 — audit-barrage lift (${runId})\n\n${entries.join('\n')}`;
}
function makeRepo(slug: string, sections: string[]): string {
  const repo = mkdtempSync(join(tmpdir(), 'slush-'));
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log\n\n${sections.join('\n')}`, 'utf8');
  return repo;
}
function logText(repo: string, slug: string): string {
  return readFileSync(join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug, 'audit-log.md'), 'utf8');
}
/** Run slush-findings with the backlog destination pointed at an isolated dir. */
function runSlush(args: string[]) {
  return runCli(['slush-findings', ...args], { env: { STACKCTL_BACKLOG_DIR: tmpBacklog() } });
}

describe('slush-findings (ported slush pile, 008 rewire)', () => {
  it('dampener NOT engaged (latest run has open HIGH) → no-op, audit-log unchanged', () => {
    const repo = makeRepo('s', [section('20260607T100000000Z-s-after_clarify', [entry('01', 'high')])]);
    const before = logText(repo, 's');
    try {
      const r = runSlush(['--feature', 's', '--repo-root', repo, '--checkpoint', 'after_clarify', '--slush-date', '2026-06-07', '--apply']);
      expect(r.status).toBe(0);
      expect(logText(repo, 's')).toBe(before); // not engaged → nothing migrated
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('engaged (2 consecutive 0-HIGH) → --apply migrates the latest run’s MED+LOW to the backlog, never HIGH', () => {
    const repo = makeRepo('s', [
      section('20260607T100000000Z-s-after_clarify', [entry('01', 'low')]),
      section('20260607T110000000Z-s-after_clarify', [entry('02', 'medium'), entry('03', 'low')]),
    ]);
    try {
      const r = runSlush(['--feature', 's', '--repo-root', repo, '--checkpoint', 'after_clarify', '--slush-date', '2026-06-07', '--apply']);
      expect(r.status).toBe(0);
      const t = logText(repo, 's');
      // latest section's MED + LOW are migrated to the backlog (not acknowledged-slush-pile)
      expect(t).toMatch(/AUDIT-20260607-02[\s\S]*?Status:\s+migrated-to-backlog TASK-\d+/);
      expect(t).toMatch(/AUDIT-20260607-03[\s\S]*?Status:\s+migrated-to-backlog TASK-\d+/);
      expect(t).not.toMatch(/^Status:\s*acknowledged-slush-pile/im);
      // the earlier section's finding is out of scope (latest-only) → stays open
      expect(t).toMatch(/AUDIT-20260607-01[\s\S]*?Status:\s+open/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('--scope all migrates EARLIER-run open MED/LOW too, leaving 0 open MEDIUM anywhere (AUDIT-20260607-47)', () => {
    const repo = makeRepo('s', [
      section('20260607T100000000Z-s-after_clarify', [entry('01', 'medium'), entry('02', 'low')]),
      section('20260607T110000000Z-s-after_clarify', [entry('03', 'medium')]),
    ]);
    try {
      const r = runSlush(['--feature', 's', '--repo-root', repo, '--checkpoint', 'after_clarify', '--scope', 'all', '--slush-date', '2026-06-07', '--apply']);
      expect(r.status).toBe(0);
      const t = logText(repo, 's');
      expect(t).toMatch(/AUDIT-20260607-01[\s\S]*?Status:\s+migrated-to-backlog TASK-\d+/);
      expect(t).toMatch(/AUDIT-20260607-02[\s\S]*?Status:\s+migrated-to-backlog TASK-\d+/);
      expect(t).toMatch(/AUDIT-20260607-03[\s\S]*?Status:\s+migrated-to-backlog TASK-\d+/);
      expect(t).not.toMatch(/^Status:\s*open/im);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('dry-run (no --apply) reports but does not write', () => {
    const repo = makeRepo('s', [
      section('20260607T100000000Z-s-after_clarify', [entry('01', 'low')]),
      section('20260607T110000000Z-s-after_clarify', [entry('02', 'medium')]),
    ]);
    const before = logText(repo, 's');
    try {
      const r = runSlush(['--feature', 's', '--repo-root', repo, '--checkpoint', 'after_clarify', '--slush-date', '2026-06-07']);
      expect(r.status).toBe(0);
      expect(logText(repo, 's')).toBe(before);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('feature not found → exit 2', () => {
    const repo = mkdtempSync(join(tmpdir(), 'slush-empty-'));
    try {
      const r = runSlush(['--feature', 'nope', '--repo-root', repo, '--apply']);
      expect(r.status).toBe(2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
