// T029 (031 US3, FR-016) — `roadmap advance <id> --to closed` end-to-end. Drives
// the real CLI against a real backlog store (STACKCTL_BACKLOG_DIR) + a fixture
// roadmap (`--doc`):
//   • dry-run (NO --apply) prints the transitive cascade plan AND mutates nothing
//     (status stays shipped, no backlog id closed — SC-004 no auto-close);
//   • --apply runs the cascade (closes the deduped subtree ids) AND sets the root
//     status to `closed`;
//   • advance <non-shipped item> --to closed is REFUSED fail-loud (exit non-zero);
//   • a non-terminal child is skip-and-reported (Scenario C) — its ids NOT closed,
//     and the advance to closed still proceeds on --apply.
// Fixtures on disk; never mocked.

import { describe, expect, it } from 'vitest';
import { chmodSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createBacklogBackend, BACKLOG_DONE_STATUS } from '../../src/backlog/backend.js';
import { provisionBacklog, writeClosureRoadmap } from '../../src/__tests__/roadmap/closure-fixtures.js';
import { runCli } from '../../src/__tests__/_run-helpers.js';

/** Status of an id in the provisioned store (undefined when absent). */
function statusOf(cwd: string, id: string): string | undefined {
  return createBacklogBackend({ cwd }).list().find((i) => i.id === id)?.status;
}

/** The recorded roadmap status of a node, read from the on-disk doc. */
function roadmapStatusOf(doc: string, id: string): string | null {
  const src = readFileSync(doc, 'utf8');
  const lines = src.split('\n');
  const head = lines.findIndex((l) => l.trim() === `## ${id}`);
  if (head < 0) return null;
  for (let i = head + 1; i < lines.length; i++) {
    if (lines[i]!.trim().startsWith('## ')) break;
    const m = /^\s*-\s+status\s*:\s*(\S+)/.exec(lines[i]!);
    if (m !== null) return m[1]!;
  }
  return null;
}

describe('031 roadmap advance --to closed', () => {
  it('dry-run prints the cascade plan and mutates NOTHING (no auto-close, SC-004)', () => {
    const backlog = provisionBacklog([{ title: 'T1' }, { title: 'T2' }, { title: 'T3' }]);
    const [t1, t2, t3] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: [t1!, t2!] },
      { id: 'impl:feature/child', status: 'shipped', partOf: ['multi:feature/root'], closes: [t3!] },
    ]);

    const dry = runCli(['roadmap', 'advance', 'multi:feature/root', '--to', 'closed', '--doc', doc], {
      cwd: backlog.cwd,
      env: { STACKCTL_BACKLOG_DIR: backlog.cwd },
    });

    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/dry-run/);
    expect(dry.stdout).toContain(t1!);
    expect(dry.stdout).toContain(t3!);
    expect(dry.stdout).toMatch(/closed/); // names the would-advance-to-closed
    // Nothing written: status stays shipped, no id closed.
    expect(roadmapStatusOf(doc, 'multi:feature/root')).toBe('shipped');
    expect(statusOf(backlog.cwd, t1!)).not.toBe(BACKLOG_DONE_STATUS);
    expect(statusOf(backlog.cwd, t3!)).not.toBe(BACKLOG_DONE_STATUS);
  });

  it('--apply closes the deduped subtree AND advances the root status to closed', () => {
    const backlog = provisionBacklog([{ title: 'T1' }, { title: 'T2' }, { title: 'T3' }]);
    const [t1, t2, t3] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: [t1!, t2!] },
      { id: 'impl:feature/child', status: 'shipped', partOf: ['multi:feature/root'], closes: [t3!] },
    ]);

    const apply = runCli(
      ['roadmap', 'advance', 'multi:feature/root', '--to', 'closed', '--apply', '--doc', doc],
      { cwd: backlog.cwd, env: { STACKCTL_BACKLOG_DIR: backlog.cwd } },
    );
    expect(apply.status).toBe(0);
    expect(statusOf(backlog.cwd, t1!)).toBe(BACKLOG_DONE_STATUS);
    expect(statusOf(backlog.cwd, t2!)).toBe(BACKLOG_DONE_STATUS);
    expect(statusOf(backlog.cwd, t3!)).toBe(BACKLOG_DONE_STATUS); // the child's id too
    expect(roadmapStatusOf(doc, 'multi:feature/root')).toBe('closed'); // root advanced
  });

  it('refuses fail-loud when the root is NOT shipped (closed only reachable from shipped)', () => {
    const backlog = provisionBacklog([{ title: 'T1' }]);
    const [t1] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'in-flight', closes: [t1!] },
    ]);

    const r = runCli(['roadmap', 'advance', 'multi:feature/root', '--to', 'closed', '--apply', '--doc', doc], {
      cwd: backlog.cwd,
      env: { STACKCTL_BACKLOG_DIR: backlog.cwd },
    });
    expect(r.status).not.toBe(0); // fail-loud
    expect(r.stderr + r.stdout).toMatch(/shipped/i);
    // Nothing written: status stays in-flight, the id not closed.
    expect(roadmapStatusOf(doc, 'multi:feature/root')).toBe('in-flight');
    expect(statusOf(backlog.cwd, t1!)).not.toBe(BACKLOG_DONE_STATUS);
  });

  it('Scenario C — a non-terminal child is skip-and-reported; advance to closed still proceeds (--apply)', () => {
    const backlog = provisionBacklog([{ title: 'T1' }, { title: 'TCHILD' }]);
    const [t1, tchild] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: [t1!] },
      // a non-terminal (in-flight) child: skip-and-report — its id is NOT closed.
      { id: 'impl:feature/wip', status: 'in-flight', partOf: ['multi:feature/root'], closes: [tchild!] },
    ]);

    const apply = runCli(
      ['roadmap', 'advance', 'multi:feature/root', '--to', 'closed', '--apply', '--doc', doc],
      { cwd: backlog.cwd, env: { STACKCTL_BACKLOG_DIR: backlog.cwd } },
    );
    expect(apply.status).toBe(0);
    expect(apply.stdout).toMatch(/skipped/i);
    expect(apply.stdout).toContain('impl:feature/wip');
    expect(statusOf(backlog.cwd, t1!)).toBe(BACKLOG_DONE_STATUS); // terminal root's id closes
    expect(statusOf(backlog.cwd, tchild!)).not.toBe(BACKLOG_DONE_STATUS); // non-terminal child's id NOT closed
    expect(roadmapStatusOf(doc, 'multi:feature/root')).toBe('closed'); // advance still proceeds
  });

  it('non-cascade advance (e.g. --to in-flight) is UNCHANGED — just rewrites the status line', () => {
    const backlog = provisionBacklog([{ title: 'T1' }]);
    const [t1] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'planned', closes: [t1!] },
    ]);
    const r = runCli(['roadmap', 'advance', 'multi:feature/root', '--to', 'in-flight', '--apply', '--doc', doc], {
      cwd: backlog.cwd,
      env: { STACKCTL_BACKLOG_DIR: backlog.cwd },
    });
    expect(r.status).toBe(0);
    expect(roadmapStatusOf(doc, 'multi:feature/root')).toBe('in-flight');
    expect(statusOf(backlog.cwd, t1!)).not.toBe(BACKLOG_DONE_STATUS); // no cascade on a non-closed advance
  });

  it('an unwritable roadmap fails BEFORE the cascade — backlog ids are NOT closed (AUDIT-20260623-07)', () => {
    const backlog = provisionBacklog([{ title: 'T1' }]);
    const [t1] = backlog.ids;
    const doc = writeClosureRoadmap([{ id: 'multi:feature/root', status: 'shipped', closes: [t1!] }]);
    // Make the roadmap's directory unwritable so the atomic temp+rename status write
    // fails (a file-only chmod does not — rename replaces it from the writable dir).
    chmodSync(dirname(doc), 0o555);
    try {
      const r = runCli(['roadmap', 'advance', 'multi:feature/root', '--to', 'closed', '--apply', '--doc', doc], {
        cwd: backlog.cwd,
        env: { STACKCTL_BACKLOG_DIR: backlog.cwd },
      });
      expect(r.status).not.toBe(0);
      // The roadmap status is written BEFORE the cascade, so a failed write leaves the
      // backlog id NOT closed — no ids-closed-but-item-shipped split across the stores.
      expect(statusOf(backlog.cwd, t1!)).not.toBe(BACKLOG_DONE_STATUS);
    } finally {
      chmodSync(dirname(doc), 0o755);
    }
  });
});
