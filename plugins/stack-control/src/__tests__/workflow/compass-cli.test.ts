// 024 US1 / FR-001..FR-005 — the `workflow compass` CLI: orientation (no --intent)
// + intent diff, gating exit codes (0 proceed; ahead/off-rail distinct non-zero; 2
// usage/unknown-intent), read-only/deterministic, and a --json shape. RED first
// (T019). SC-001. Exercises the real CLI via runCli (end-to-end).

import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(nodes: Parameters<typeof makeWorkflowFixture>[0]): WorkflowFixture {
  const f = makeWorkflowFixture(nodes);
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const e of readdirSync(rel === '' ? root : join(root, rel), { withFileTypes: true })) {
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(childRel);
      else {
        const st = statSync(join(root, childRel));
        out.set(childRel, `${st.size}:${st.mtimeMs}`);
      }
    }
  };
  walk('');
  return out;
}

const ITEM = 'multi:feature/x';
const planned = () => fixture([{ identifier: ITEM, status: 'planned' }]);

describe('024 US1 — workflow compass orientation (no --intent)', () => {
  it('reports the current phase + legitimate next action; exits 0', () => {
    const f = planned();
    const r = runCli(['workflow', 'compass', ITEM], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('current phase: planned');
    expect(r.stdout).toMatch(/legitimate next action/i);
    expect(r.stdout).toContain('designing');
  });
});

describe('024 US1 — workflow compass intent diff (gating exit codes)', () => {
  it('on-course exits 0', () => {
    const f = planned();
    const r = runCli(['workflow', 'compass', ITEM, '--intent', 'design'], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('verdict: on-course');
  });

  it('ahead exits non-zero and names the skipped step', () => {
    const f = planned();
    const r = runCli(['workflow', 'compass', ITEM, '--intent', 'define'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBe(2);
    expect(r.stdout).toContain('verdict: ahead');
    expect(r.stdout).toContain('skipped step: designing');
  });

  it('off-rail (unknown item / orphan) exits non-zero, distinct from ahead and usage', () => {
    const f = planned();
    const r = runCli(['workflow', 'compass', 'multi:feature/orphan', '--intent', 'design'], { cwd: f.root });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBe(2);
    expect(r.stdout + r.stderr).toMatch(/off-rail|no roadmap node/i);
  });

  it('unknown intent exits 2 and names the known set (FR-004)', () => {
    const f = planned();
    const r = runCli(['workflow', 'compass', ITEM, '--intent', 'frobnicate'], { cwd: f.root });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown intent/i);
    expect(r.stderr).toMatch(/design/); // lists a known intent
  });

  it('ahead and off-rail use DISTINCT exit codes (FR-003)', () => {
    const f = planned();
    const ahead = runCli(['workflow', 'compass', ITEM, '--intent', 'define'], { cwd: f.root });
    const offRail = runCli(['workflow', 'compass', 'multi:feature/nope', '--intent', 'design'], { cwd: f.root });
    expect(ahead.status).not.toBe(offRail.status);
  });
});

describe('024 FR-005 — read-only + deterministic + --json', () => {
  it('writes nothing and produces identical output on re-run', () => {
    const f = planned();
    const before = snapshot(f.root);
    const r1 = runCli(['workflow', 'compass', ITEM, '--intent', 'define'], { cwd: f.root });
    const r2 = runCli(['workflow', 'compass', ITEM, '--intent', 'define'], { cwd: f.root });
    expect(r1.stdout).toBe(r2.stdout);
    expect(r1.status).toBe(r2.status);
    expect(snapshot(f.root)).toEqual(before);
  });

  it('--json emits the verdict shape and mirrors the exit code', () => {
    const f = planned();
    const r = runCli(['workflow', 'compass', ITEM, '--intent', 'define', '--json'], { cwd: f.root });
    const parsed = JSON.parse(r.stdout) as { outcome: string; skippedStep: string; exitCode: number };
    expect(parsed.outcome).toBe('ahead');
    expect(parsed.skippedStep).toBe('designing');
    expect(parsed.exitCode).toBe(r.status);
  });
});
