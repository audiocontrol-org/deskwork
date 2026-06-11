// T025 (RED-first, US4, 008) — the slush-findings REWIRE: the dampener DECISION
// (slush-remaining.ts) is unchanged, but the DESTINATION of a parked flip is now
// a backlog migrated-finding item + a `migrated-to-backlog <task-id>` audit-log
// disposition (NOT `acknowledged-slush-pile-<date>`). HIGHs are still never
// slushed. `--burn-down` is removed (the backlog is the burn-down queue, FR-022).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { tmpBacklog } from './helpers.js';

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
  const repo = mkdtempSync(join(tmpdir(), 'slush-rewire-'));
  // Installation marker: --at (R2 retired --repo-root) resolves via walk-up.
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  const dir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'audit-log.md'), `# Audit Log\n\n${sections.join('\n')}`, 'utf8');
  return repo;
}
function logText(repo: string, slug: string): string {
  return readFileSync(join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug, 'audit-log.md'), 'utf8');
}

describe('slush-findings rewire — destination is the backlog (US4, T025)', () => {
  it('a parked flip → a migrated-finding backlog item + migrated-to-backlog disposition (NOT acknowledged-slush-pile)', () => {
    const repo = makeRepo('s', [
      section('20260607T100000000Z-s-after_clarify', [entry('01', 'low')]),
      section('20260607T110000000Z-s-after_clarify', [entry('02', 'medium'), entry('03', 'low')]),
    ]);
    const backlog = tmpBacklog();
    try {
      const r = runCli(
        ['slush-findings', '--feature', 's', '--at', repo, '--checkpoint', 'after_clarify', '--slush-date', '2026-06-07', '--apply'],
        { env: { STACKCTL_BACKLOG_DIR: backlog } },
      );
      expect(r.status).toBe(0);
      const t = logText(repo, 's');
      expect(t).toMatch(/AUDIT-20260607-02[\s\S]*?Status:\s+migrated-to-backlog TASK-\d+/);
      expect(t).toMatch(/AUDIT-20260607-03[\s\S]*?Status:\s+migrated-to-backlog TASK-\d+/);
      expect(t).not.toMatch(/^Status:\s*acknowledged-slush-pile/im);

      const items = createBacklogBackend({ cwd: backlog }).list();
      expect(items).toHaveLength(2);
      for (const it of items) expect(it.type).toBe('migrated-finding');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('dry-run (no --apply) writes nothing and creates no backlog items', () => {
    const repo = makeRepo('s', [
      section('20260607T100000000Z-s-after_clarify', [entry('01', 'low')]),
      section('20260607T110000000Z-s-after_clarify', [entry('02', 'medium')]),
    ]);
    const backlog = tmpBacklog();
    const before = logText(repo, 's');
    try {
      const r = runCli(
        ['slush-findings', '--feature', 's', '--at', repo, '--checkpoint', 'after_clarify', '--slush-date', '2026-06-07'],
        { env: { STACKCTL_BACKLOG_DIR: backlog } },
      );
      expect(r.status).toBe(0);
      expect(logText(repo, 's')).toBe(before);
      expect(createBacklogBackend({ cwd: backlog }).list()).toHaveLength(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('HIGHs are never slushed — a latest-run HIGH leaves the dampener disengaged, nothing migrated', () => {
    const repo = makeRepo('s', [section('20260607T100000000Z-s-after_clarify', [entry('01', 'high')])]);
    const backlog = tmpBacklog();
    try {
      const r = runCli(
        ['slush-findings', '--feature', 's', '--at', repo, '--checkpoint', 'after_clarify', '--slush-date', '2026-06-07', '--apply'],
        { env: { STACKCTL_BACKLOG_DIR: backlog } },
      );
      expect(r.status).toBe(0);
      expect(logText(repo, 's')).toMatch(/AUDIT-20260607-01[\s\S]*?Status:\s+open/);
      expect(logText(repo, 's')).not.toMatch(/migrated-to-backlog/);
      expect(createBacklogBackend({ cwd: backlog }).list()).toHaveLength(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('--burn-down is removed — rejected as an unknown flag (exit 2)', () => {
    const repo = makeRepo('s', [section('20260607T110000000Z-s-after_clarify', [entry('02', 'medium')])]);
    try {
      const r = runCli(['slush-findings', '--feature', 's', '--at', repo, '--burn-down', '--apply']);
      expect(r.status).toBe(2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
