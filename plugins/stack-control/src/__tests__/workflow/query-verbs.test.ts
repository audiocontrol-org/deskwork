// US1 (022) — the read-only query verbs `status` / `can-enter` / `next` report
// deterministically, write nothing, and REPORT an unmet gate rather than refuse
// (v1 gates never block — analyze U1, FR-010). RED first (T013) — drives the CLI.

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

/** A recursive (path → size:mtime) snapshot of the installation tree. */
function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const e of readdirSync(rel === '' ? root : join(root, rel), { withFileTypes: true })) {
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        walk(childRel);
      } else {
        const st = statSync(join(root, childRel));
        out.set(childRel, `${st.size}:${st.mtimeMs}`);
      }
    }
  };
  walk('');
  return out;
}

const ITEM = 'multi:feature/x';

describe('US1 query verbs — workflow status', () => {
  it('reports the derived phase and enumerates unmet exit criteria; exits 0 (gate reported, not enforced)', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned', design: 'd', spec: 'specs/x', analyzeClean: true }]);
    f.writeSpecTasks('specs/x', false); // tasks incomplete → implementing, exit unmet
    const r = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(r.status).toBe(0); // unmet gate is REPORTED, never a refusal (FR-010)
    expect(r.stdout).toContain('phase: implementing');
    expect(r.stdout).toContain('exit criteria: 0 of 1 met');
    expect(r.stdout).toContain('tasks-complete spec');
  });

  it('is deterministic and read-only — identical output, zero writes on re-run', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned', design: 'd', spec: 'specs/x', analyzeClean: true }]);
    f.writeSpecTasks('specs/x', false);
    const before = snapshot(f.root);
    const r1 = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    const r2 = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    const after = snapshot(f.root);
    expect(r1.stdout).toBe(r2.stdout);
    expect([...after.entries()].sort()).toEqual([...before.entries()].sort());
  });
});

describe('US1 query verbs — workflow can-enter', () => {
  it('reports false and names the missing entrance criteria', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned', design: 'd', spec: 'specs/x', analyzeClean: false }]);
    const r = runCli(['workflow', 'can-enter', ITEM, 'implementing'], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("cannot enter 'implementing' yet");
    expect(r.stdout).toContain('node-marker analyze-clean');
  });

  it('reports true when entrance criteria are met', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned', design: 'd', spec: 'specs/x', analyzeClean: true }]);
    const r = runCli(['workflow', 'can-enter', ITEM, 'implementing'], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("can enter 'implementing'");
  });
});

describe('US1 query verbs — workflow next', () => {
  it('names the current phase work, the next transition, and previews effects', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned', design: 'd', spec: 'specs/x', analyzeClean: false }]);
    const r = runCli(['workflow', 'next', ITEM], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('current phase: specifying');
    expect(r.stdout).toContain('work: stack-control:define');
    expect(r.stdout).toContain('next transition: start-implementing');
    expect(r.stdout).toContain('commit');
  });
});

describe('US1 query verbs — usage', () => {
  it('exits 2 on an unknown item', () => {
    const f = fixture([{ identifier: ITEM, status: 'planned' }]);
    const r = runCli(['workflow', 'status', 'multi:feature/nope'], { cwd: f.root });
    expect(r.status).toBe(2);
  });
});
