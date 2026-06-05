import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';

// spec-check reports a spec's AUTHORING state so the define/extend skills
// know what to advance. Read-only; it reports, it never authors or repairs.
// Output is a machine-readable presence line (e.g. `spec=yes plan=yes tasks=no`)
// so a skill can parse it deterministically. Unlike execute-check it never
// gates — a partially-authored spec is a valid, reportable state, exit 0.
describe('stackctl spec-check (T024)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'stackctl-spec-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  function makeSpec(opts: { spec?: boolean; plan?: boolean; tasks?: boolean }): string {
    const dir = join(work, 'specs', '999-fixture');
    mkdirSync(dir, { recursive: true });
    if (opts.spec) writeFileSync(join(dir, 'spec.md'), '# fixture spec\n');
    if (opts.plan) writeFileSync(join(dir, 'plan.md'), '# fixture plan\n');
    if (opts.tasks) writeFileSync(join(dir, 'tasks.md'), '# fixture tasks\n');
    return dir;
  }

  it('reports all-present as a machine-readable line, exit 0', () => {
    const dir = makeSpec({ spec: true, plan: true, tasks: true });
    const r = runCli(['spec-check', '--spec', dir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/spec=yes plan=yes tasks=yes/);
  });

  it('reports a partially-authored spec faithfully (no gating), exit 0', () => {
    const dir = makeSpec({ spec: true, plan: true, tasks: false });
    const r = runCli(['spec-check', '--spec', dir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/spec=yes plan=yes tasks=no/);
  });

  it('reports a bare spec dir faithfully, exit 0', () => {
    const dir = makeSpec({ spec: false, plan: false, tasks: false });
    const r = runCli(['spec-check', '--spec', dir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/spec=no plan=no tasks=no/);
  });

  it('exits 2 when --spec is missing', () => {
    const r = runCli(['spec-check']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--spec/);
  });

  it('exits non-zero with a descriptive error when the spec dir is absent', () => {
    const r = runCli(['spec-check', '--spec', join(work, 'does-not-exist')]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not found/i);
  });

  it('exits non-zero with a directory-specific error when --spec points at a file', () => {
    const dir = makeSpec({ spec: true, plan: true, tasks: true });
    const fileAsSpec = join(dir, 'spec.md'); // an existing FILE, not a dir
    const r = runCli(['spec-check', '--spec', fileAsSpec]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not a directory/i);
  });

  it('exits 2 on an unknown flag — no flag silently ignored', () => {
    const dir = makeSpec({ spec: true, plan: true, tasks: true });
    const r = runCli(['spec-check', '--spec', dir, '--bogus']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unexpected argument/i);
  });

  it('exits 2 on a stray positional', () => {
    const dir = makeSpec({ spec: true, plan: true, tasks: true });
    const r = runCli(['spec-check', '--spec', dir, 'extra']);
    expect(r.status).toBe(2);
  });
});
