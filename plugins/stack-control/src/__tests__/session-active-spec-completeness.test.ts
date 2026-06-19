// 028 US1 T048/T049 (FR-006; TASK-130). `inferChainPosition` must NOT nominate a
// FULLY-IMPLEMENTED spec (tasks.md present with no remaining `- [ ]` work) as the
// "active" spec with a bogus next /speckit-* step.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inferChainPosition } from '../session/chain-position.js';

const roots: string[] = [];
afterEach(() => {
  // Remove the fixture trees, not just the tracking array — otherwise every run
  // leaves sc-active-spec-* dirs in the OS tmpdir (AUDIT-BARRAGE-codex-02/claude-03).
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function makeFeature(tasksBody: string): string {
  const root = mkdtempSync(join(tmpdir(), 'sc-active-spec-'));
  roots.push(root);
  const specDir = 'specs/099-fixture';
  mkdirSync(join(root, '.specify'), { recursive: true });
  mkdirSync(join(root, specDir), { recursive: true });
  writeFileSync(join(root, '.specify', 'feature.json'), JSON.stringify({ feature_directory: specDir }));
  writeFileSync(join(root, specDir, 'spec.md'), 'spec');
  writeFileSync(join(root, specDir, 'plan.md'), 'plan');
  writeFileSync(join(root, specDir, 'tasks.md'), tasksBody);
  return root;
}

describe('inferChainPosition — fully-implemented spec is not "active" (T049)', () => {
  it('returns null when every task is checked off (no remaining work)', () => {
    const root = makeFeature('# Tasks\n\n- [x] T001 a\n- [x] T002 b\n- [x] T003 c\n');
    expect(inferChainPosition(root)).toBeNull();
  });

  it('still reports an active position when tasks remain', () => {
    const root = makeFeature('# Tasks\n\n- [x] T001 a\n- [ ] T002 b\n');
    const pos = inferChainPosition(root);
    expect(pos).not.toBeNull();
    expect(pos!.nextStep).toBe('analyze');
  });

  it('reports an active position when tasks.md has no task checkboxes at all', () => {
    // A tasks.md present but with zero checkboxes is degenerate, not "complete".
    const root = makeFeature('# Tasks\n\n(no tasks yet)\n');
    expect(inferChainPosition(root)).not.toBeNull();
  });
});
