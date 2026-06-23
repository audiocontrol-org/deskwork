// 032 US4 (T022/T024) — the adopter-defined `validating` phase. The bundled
// WORKFLOW.md defines `validating` between the post-merge `status: shipped` and the
// terminal `closed`, with `transition:close` (validating → closed) gated on
// `approval-marker validated` (operator-confirm default). A shipped item cannot close
// without the marker; with it, closes. An installation override of validating's exit
// criteria is honored by the SAME override-resolution mechanism, with NO engine change
// (FR-014/FR-015/FR-016). RED first.

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { BUNDLED_WORKFLOW_PATH, loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { makeWorkflowFixture, type FixtureNode, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});
function statusOf(f: WorkflowFixture): string {
  return loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.status;
}
function fixture(node: FixtureNode): WorkflowFixture {
  const f = makeWorkflowFixture([node], { git: true });
  fixtures.push(f);
  f.commitAll('seed');
  return f;
}

describe('032 US4 — the validating phase (bundled default; T022)', () => {
  it('the bundled WORKFLOW.md has phase:validating (exit approval-marker validated, next closed)', () => {
    const f = makeWorkflowFixture();
    const doc = loadWorkflowDoc(f.root);
    f.cleanup();
    const validating = doc.phases.find((p) => p.id === 'validating');
    expect(validating).toBeDefined();
    expect(validating!.next).toBe('closed');
    expect(validating!.exit.some((c) => c.kind === 'approval-marker' && c.target === 'validated')).toBe(true);
    const close = doc.transitions.find((t) => t.codename === 'close');
    expect(close!.from).toBe('validating');
    expect(close!.to).toBe('closed');
    expect(close!.exitGate.some((c) => c.kind === 'approval-marker' && c.target === 'validated')).toBe(true);
  });

  it('a shipped item WITHOUT validated cannot close; WITH it, closes (default operator-confirm)', () => {
    const noMark = fixture({ identifier: ITEM, status: 'shipped' });
    const refused = runCli(['roadmap', 'advance', ITEM, '--to', 'closed', '--apply'], { cwd: noMark.root });
    expect(refused.status).not.toBe(0);
    expect(refused.stdout + refused.stderr).toMatch(/validated/i);
    expect(statusOf(noMark)).toBe('shipped');

    const marked = fixture({ identifier: ITEM, status: 'shipped', validated: true });
    const ok = runCli(['roadmap', 'advance', ITEM, '--to', 'closed', '--apply'], { cwd: marked.root });
    expect(ok.status, ok.stderr).toBe(0);
    expect(statusOf(marked)).toBe('closed');
  });
});

describe('032 US4 — adopter override of validating exit is honored, no engine change (T024)', () => {
  /** Write an override WORKFLOW.md = the bundled doc with validating's gate swapped from
   *  `validated` to `design-approved` (a different recorded marker), proving the override
   *  changes what `validating → closed` requires. */
  function withOverride(f: WorkflowFixture): void {
    const bundled = readFileSync(BUNDLED_WORKFLOW_PATH, 'utf8');
    const overridden = bundled.replaceAll('approval-marker validated', 'approval-marker design-approved');
    writeFileSync(join(f.root, '.stack-control', 'WORKFLOW.md'), overridden, 'utf8');
  }

  it('the override gate (design-approved) is enforced over the bundled default (validated)', () => {
    // validated present but design-approved absent: the OVERRIDE gate (design-approved) is unmet,
    // so close is refused even though the bundled-default marker (validated) IS present.
    const f = fixture({ identifier: ITEM, status: 'shipped', validated: true, designApproved: false });
    withOverride(f);
    const refused = runCli(['roadmap', 'advance', ITEM, '--to', 'closed', '--apply'], { cwd: f.root });
    expect(refused.status).not.toBe(0);
    expect(refused.stdout + refused.stderr).toMatch(/design-approved/i);
    expect(statusOf(f)).toBe('shipped');
  });

  it('with the override gate satisfied (design-approved), the item closes — bundled default not required', () => {
    // design-approved present, validated ABSENT: the override gate is met → closes, proving the
    // bundled `validated` is no longer the gate (the adopter redefined validating's exit).
    const f = fixture({ identifier: ITEM, status: 'shipped', designApproved: true });
    withOverride(f);
    const ok = runCli(['roadmap', 'advance', ITEM, '--to', 'closed', '--apply'], { cwd: f.root });
    expect(ok.status, ok.stderr).toBe(0);
    expect(statusOf(f)).toBe('closed');
  });
});
