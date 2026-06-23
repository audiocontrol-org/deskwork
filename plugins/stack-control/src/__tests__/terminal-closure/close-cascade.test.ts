// T015 (031 US1) — `roadmap close-related <root> --cascade` end-to-end, mirroring
// close-related.test.ts. Drives the real CLI against a real backlog store (the
// `STACKCTL_BACKLOG_DIR` seam) and a fixture roadmap (`--doc`). Dry-run lists the
// transitive plan and writes NOTHING; `--apply` closes the deduped set across the
// part-of subtree; a re-run reports everything already-closed and exits 0
// (idempotent — quickstart Scenario A). Fixtures on disk; never mocked.

import { describe, expect, it } from 'vitest';
import { createBacklogBackend, BACKLOG_DONE_STATUS } from '../../backlog/backend.js';
import { provisionBacklog, writeClosureRoadmap } from '../roadmap/closure-fixtures.js';
import { runCli } from '../_run-helpers.js';

/** Status of an id in the provisioned store (undefined when absent). */
function statusOf(cwd: string, id: string): string | undefined {
  return createBacklogBackend({ cwd }).list().find((i) => i.id === id)?.status;
}

describe('031 roadmap close-related --cascade', () => {
  it('dry-run lists the transitive plan (nodes + closeIds) and writes nothing', () => {
    const backlog = provisionBacklog([{ title: 'T1' }, { title: 'T2' }, { title: 'T3' }]);
    const [t1, t2, t3] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: [t1!, t2!] },
      { id: 'impl:feature/child', status: 'shipped', partOf: ['multi:feature/root'], closes: [t3!] },
    ]);

    const dry = runCli(['roadmap', 'close-related', 'multi:feature/root', '--cascade', '--doc', doc], {
      cwd: backlog.cwd,
      env: { STACKCTL_BACKLOG_DIR: backlog.cwd },
    });

    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/dry-run/);
    expect(dry.stdout).toContain(t1!);
    expect(dry.stdout).toContain(t2!);
    expect(dry.stdout).toContain(t3!);
    expect(dry.stdout).toContain('impl:feature/child'); // the child node is listed
    // Nothing written.
    expect(statusOf(backlog.cwd, t1!)).not.toBe(BACKLOG_DONE_STATUS);
    expect(statusOf(backlog.cwd, t3!)).not.toBe(BACKLOG_DONE_STATUS);
  });

  it('--apply closes the deduped subtree set; a re-run reports already-closed (idempotent)', () => {
    const backlog = provisionBacklog([{ title: 'T1' }, { title: 'T2' }, { title: 'T3' }]);
    const [t1, t2, t3] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: [t1!, t2!] },
      { id: 'impl:feature/child', status: 'shipped', partOf: ['multi:feature/root'], closes: [t3!] },
    ]);

    const apply = runCli(
      ['roadmap', 'close-related', 'multi:feature/root', '--cascade', '--apply', '--doc', doc],
      { cwd: backlog.cwd, env: { STACKCTL_BACKLOG_DIR: backlog.cwd } },
    );
    expect(apply.status).toBe(0);
    expect(statusOf(backlog.cwd, t1!)).toBe(BACKLOG_DONE_STATUS);
    expect(statusOf(backlog.cwd, t2!)).toBe(BACKLOG_DONE_STATUS);
    expect(statusOf(backlog.cwd, t3!)).toBe(BACKLOG_DONE_STATUS); // the child's id too

    const again = runCli(
      ['roadmap', 'close-related', 'multi:feature/root', '--cascade', '--apply', '--doc', doc],
      { cwd: backlog.cwd, env: { STACKCTL_BACKLOG_DIR: backlog.cwd } },
    );
    expect(again.status).toBe(0);
    expect(again.stdout).toMatch(/already closed/);
  });

  it('without --cascade, close-related keeps single-node behavior (child id untouched)', () => {
    const backlog = provisionBacklog([{ title: 'T1' }, { title: 'T3' }]);
    const [t1, t3] = backlog.ids;
    const doc = writeClosureRoadmap([
      { id: 'multi:feature/root', status: 'shipped', closes: [t1!] },
      { id: 'impl:feature/child', status: 'shipped', partOf: ['multi:feature/root'], closes: [t3!] },
    ]);

    const apply = runCli(['roadmap', 'close-related', 'multi:feature/root', '--apply', '--doc', doc], {
      cwd: backlog.cwd,
      env: { STACKCTL_BACKLOG_DIR: backlog.cwd },
    });
    expect(apply.status).toBe(0);
    expect(statusOf(backlog.cwd, t1!)).toBe(BACKLOG_DONE_STATUS); // root's own id closes
    expect(statusOf(backlog.cwd, t3!)).not.toBe(BACKLOG_DONE_STATUS); // child id NOT cascaded
  });
});
