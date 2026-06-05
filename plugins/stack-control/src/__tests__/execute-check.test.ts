import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';

// Pin the "runnable" set (A1): a Spec Kit spec is runnable for native
// /speckit-implement iff tasks.md is present. spec.md + plan.md are
// assumed already present from the upstream Spec Kit chain; the gating
// artifact is tasks.md (the thing /speckit-tasks produces).
describe('stackctl execute-check (T015)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'stackctl-exec-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  function makeSpec(opts: { tasks: boolean }): string {
    const dir = join(work, 'specs', '999-fixture');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'spec.md'), '# fixture spec\n');
    writeFileSync(join(dir, 'plan.md'), '# fixture plan\n');
    if (opts.tasks) writeFileSync(join(dir, 'tasks.md'), '# fixture tasks\n');
    return dir;
  }

  it('exits 0 when tasks.md is present (runnable)', () => {
    const dir = makeSpec({ tasks: true });
    const r = runCli(['execute-check', '--spec', dir]);
    expect(r.status).toBe(0);
  });

  it('exits non-zero naming the missing tasks.md when not runnable', () => {
    const dir = makeSpec({ tasks: false });
    const r = runCli(['execute-check', '--spec', dir]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/tasks\.md missing; spec not runnable \(run \/speckit-tasks first\)/);
  });

  it('never exits 0 on a non-runnable spec (no fabricated verdict — FR-008/VR-1)', () => {
    const dir = makeSpec({ tasks: false });
    const r = runCli(['execute-check', '--spec', dir]);
    expect(r.status).not.toBe(0);
  });

  it('exits non-zero with a descriptive error when the spec dir is absent', () => {
    const r = runCli(['execute-check', '--spec', join(work, 'does-not-exist')]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not found/i);
  });

  it('exits 2 when --spec is missing', () => {
    const r = runCli(['execute-check']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--spec/);
  });

  it('exits non-zero with a directory-specific error when --spec points at a file (AUDIT-08)', () => {
    const dir = makeSpec({ tasks: true });
    const fileAsSpec = join(dir, 'tasks.md'); // an existing FILE, not a dir
    const r = runCli(['execute-check', '--spec', fileAsSpec]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not a directory/i);
  });

  it('exits 2 on an unknown flag — no flag silently ignored (AUDIT-09)', () => {
    const dir = makeSpec({ tasks: true });
    const r = runCli(['execute-check', '--spec', dir, '--bogus']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unexpected argument/i);
  });

  it('exits 2 on a stray positional (AUDIT-09)', () => {
    const dir = makeSpec({ tasks: true });
    const r = runCli(['execute-check', '--spec', dir, 'extra']);
    expect(r.status).toBe(2);
  });
});
