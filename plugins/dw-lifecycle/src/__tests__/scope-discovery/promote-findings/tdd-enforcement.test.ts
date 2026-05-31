/**
 * Phase 13 Task 3 — mechanical TDD enforcement for fix-finding tasks.
 *
 * Tests for the pure-fn library that the doctor rule + commit-msg gate
 * compose. Vitest invocation is injected as a stub so tests don't
 * recurse into vitest themselves.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractTestFilePath,
  findCompletedFixFindingTasks,
  findUncheckedTasksInOrder,
  verifyFixTaskTDD,
  type VitestRunner,
} from '../../../scope-discovery/promote-findings/tdd-enforcement.js';

describe('extractTestFilePath — path extraction from task block prose', () => {
  it("extracts a backticked .test.ts path", () => {
    const block =
      'Step 1: Write failing test at `plugins/x/foo.test.ts` covering the case.';
    expect(extractTestFilePath(block)).toBe('plugins/x/foo.test.ts');
  });

  it("extracts a backticked .test.tsx path", () => {
    const block =
      'Step 1: Add test at `src/components/Bar.test.tsx`.';
    expect(extractTestFilePath(block)).toBe('src/components/Bar.test.tsx');
  });

  it("prefers backticked path over plain-text path when both present", () => {
    const block =
      'Step 1: Write failing test at `plugins/a/preferred.test.ts`. Reminds me of plugins/b/other.test.ts which is unrelated.';
    expect(extractTestFilePath(block)).toBe('plugins/a/preferred.test.ts');
  });

  it("falls back to plain-text path when no backticked match", () => {
    const block = 'Step 1: Write failing test at plugins/x/plain.test.ts (note absence of backticks).';
    expect(extractTestFilePath(block)).toBe('plugins/x/plain.test.ts');
  });

  it("returns null when no test path is cited", () => {
    const block = 'Step 1: Document the change in the workplan.';
    expect(extractTestFilePath(block)).toBeNull();
  });

  it("accepts .test.mts and .test.cts variants", () => {
    expect(
      extractTestFilePath('Step 1: Write test at `src/x.test.mts`.'),
    ).toBe('src/x.test.mts');
    expect(
      extractTestFilePath('Step 1: Write test at `src/y.test.cts`.'),
    ).toBe('src/y.test.cts');
  });
});

describe('verifyFixTaskTDD — file presence + vitest exit-code check', () => {
  let workDir: string;
  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'tdd-enforce-'));
    mkdirSync(join(workDir, 'plugins/x'), { recursive: true });
    writeFileSync(
      join(workDir, 'plugins/x/exists.test.ts'),
      'export {}\n',
      'utf8',
    );
  });
  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("returns valid=true when file exists and vitest exits 0", async () => {
    const stub: VitestRunner = async () => ({ exitCode: 0, output: 'PASS' });
    const result = await verifyFixTaskTDD({
      workplanTaskBlock: 'Step 1: Write at `plugins/x/exists.test.ts`.',
      repoRoot: workDir,
      runVitest: stub,
    });
    expect(result.valid).toBe(true);
    expect(result.testFilePath).toBe('plugins/x/exists.test.ts');
  });

  it("returns reason='no-test-file-cited' when block has no path", async () => {
    const result = await verifyFixTaskTDD({
      workplanTaskBlock: 'Step 1: Write a function. No test reference here.',
      repoRoot: workDir,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no-test-file-cited');
  });

  it("returns reason='missing-test-file' when cited path doesn't exist", async () => {
    const result = await verifyFixTaskTDD({
      workplanTaskBlock: 'Step 1: Write at `plugins/x/does-not-exist.test.ts`.',
      repoRoot: workDir,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing-test-file');
    expect(result.testFilePath).toBe('plugins/x/does-not-exist.test.ts');
  });

  it("returns reason='test-failing' when vitest exits non-zero", async () => {
    const stub: VitestRunner = async () => ({
      exitCode: 1,
      output: 'FAIL: 3 tests failed',
    });
    const result = await verifyFixTaskTDD({
      workplanTaskBlock: 'Step 1: Write at `plugins/x/exists.test.ts`.',
      repoRoot: workDir,
      runVitest: stub,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('test-failing');
    expect(result.vitestOutput).toContain('FAIL');
  });

  it("returns reason='vitest-invocation-error' when runner throws", async () => {
    const stub: VitestRunner = async () => {
      throw new Error('vitest binary not found');
    };
    const result = await verifyFixTaskTDD({
      workplanTaskBlock: 'Step 1: Write at `plugins/x/exists.test.ts`.',
      repoRoot: workDir,
      runVitest: stub,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('vitest-invocation-error');
  });

  it("with no runVitest injected, presence check alone determines validity", async () => {
    const result = await verifyFixTaskTDD({
      workplanTaskBlock: 'Step 1: Write at `plugins/x/exists.test.ts`.',
      repoRoot: workDir,
    });
    expect(result.valid).toBe(true);
  });
});

describe('findCompletedFixFindingTasks — workplan walker', () => {
  it("finds checked tasks tagged (fix-finding-AUDIT-...)", () => {
    const workplan = [
      '## Phase 14',
      '',
      '### Task 1: Other work',
      '- [ ] Unrelated step',
      '',
      '### Task 14.1: Quiet noise (fix-finding-AUDIT-20260529-12)',
      '',
      'Body prose.',
      '',
      '- [x] Step 1: tests at `plugins/x/foo.test.ts`',
      '',
      '### Task 14.2: Other (fix-finding-AUDIT-20260529-13)',
      '',
      '- [ ] Step 1: tests at `plugins/y/bar.test.ts`',
    ].join('\n');
    const tasks = findCompletedFixFindingTasks(workplan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.findingId).toBe('AUDIT-20260529-12');
    expect(tasks[0]?.taskBlock).toContain('Quiet noise');
  });

  it("returns empty when no fix-finding-tagged tasks are checked", () => {
    const workplan = [
      '### Task 1.1: Item (fix-finding-AUDIT-20260529-12)',
      '',
      '- [ ] Step 1: not yet done',
    ].join('\n');
    const tasks = findCompletedFixFindingTasks(workplan);
    expect(tasks).toEqual([]);
  });

  it("returns empty when no fix-finding tasks exist at all", () => {
    const workplan = '## Phase 14\n\n### Task 1: Unrelated\n\n- [x] Done\n';
    const tasks = findCompletedFixFindingTasks(workplan);
    expect(tasks).toEqual([]);
  });

  it("handles multiple checked fix-finding tasks", () => {
    const workplan = [
      '### Task 1: First (fix-finding-AUDIT-20260529-12)',
      '- [x] Step 1: `a.test.ts`',
      '',
      '### Task 2: Second (fix-finding-AUDIT-20260529-13)',
      '- [x] Step 1: `b.test.ts`',
    ].join('\n');
    const tasks = findCompletedFixFindingTasks(workplan);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.findingId)).toEqual([
      'AUDIT-20260529-12',
      'AUDIT-20260529-13',
    ]);
  });
});

/**
 * Regression coverage for AUDIT-20260530-07: the gate's task-heading
 * regex must match the actual shape `workplan-task-renderer` emits
 * (`### Task N.M (fix-finding-AUDIT-NNNNNNNN-NN): ...`), not the
 * synthetic shape the existing fixtures use (`### Task 99.1: Fix ...
 * (fix-finding-...)`). Discovered live during the Phase 15 hook
 * dogfood — `check-open-findings` refused despite `promote-findings
 * --auto` successfully inserting fix-tasks, because the gate's parser
 * skipped past them.
 */
describe('findUncheckedTasksInOrder — renderer-output shape (AUDIT-20260530-07)', () => {
  it('recognizes the clean renderer-output shape: `### Task N.M (fix-finding-AUDIT-...): title`', () => {
    const workplan = [
      '## Phase 15: current',
      '',
      '### Task 15.1 (fix-finding-AUDIT-20260530-01): Title text',
      '',
      '- [ ] Step 1: write failing test',
      '- [ ] Step 2: implement fix',
      '',
    ].join('\n');
    const tasks = findUncheckedTasksInOrder(workplan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.findingId).toBe('AUDIT-20260530-01');
  });

  it('recognizes the renderer-output shape with cross-model nested parens in the marker', () => {
    const workplan = [
      '## Phase 15: current',
      '',
      '### Task 15.1 (fix-finding-AUDIT-20260530-01 (claude-01 + claude-04 + codex-03; cross-model)): Title text',
      '',
      '- [ ] Step 1: write failing test',
      '',
    ].join('\n');
    const tasks = findUncheckedTasksInOrder(workplan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.findingId).toBe('AUDIT-20260530-01');
  });

  it('walks N renderer-shaped fix-tasks in order, populating findingId for each', () => {
    const workplan = [
      '## Phase 15: current',
      '',
      '### Task 15.1 (fix-finding-AUDIT-20260530-01): First',
      '',
      '- [ ] Step 1',
      '',
      '### Task 15.2 (fix-finding-AUDIT-20260530-02): Second',
      '',
      '- [ ] Step 1',
      '',
      '### Task 15.3 (fix-finding-AUDIT-20260530-07): Third',
      '',
      '- [ ] Step 1',
      '',
    ].join('\n');
    const tasks = findUncheckedTasksInOrder(workplan);
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.findingId)).toEqual([
      'AUDIT-20260530-01',
      'AUDIT-20260530-02',
      'AUDIT-20260530-07',
    ]);
  });

  it('still recognizes the legacy clean heading without parenthetical marker', () => {
    const workplan = [
      '## Phase 15',
      '',
      '### Task 15.4: Plain task title',
      '',
      '- [ ] Step 1',
      '',
    ].join('\n');
    const tasks = findUncheckedTasksInOrder(workplan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.findingId).toBeNull();
  });
});

/**
 * Same regression for `findCompletedFixFindingTasks` — the closed-task
 * walker's regex sits next to `findUncheckedTasksInOrder`'s and has
 * the identical shape assumption. The TDD-discipline doctor rule + the
 * commit-msg gate both rely on it.
 */
describe('findCompletedFixFindingTasks — renderer-output shape (AUDIT-20260530-07)', () => {
  it('detects a checked fix-task in clean renderer shape', () => {
    const workplan = [
      '### Task 15.1 (fix-finding-AUDIT-20260530-01): Title',
      '',
      '- [x] Step 1: `plugins/x/foo.test.ts`',
      '',
    ].join('\n');
    const tasks = findCompletedFixFindingTasks(workplan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.findingId).toBe('AUDIT-20260530-01');
  });

  it('detects a checked fix-task with nested cross-model parens in the marker', () => {
    const workplan = [
      '### Task 15.1 (fix-finding-AUDIT-20260530-01 (claude-01 + codex-03; cross-model)): Title',
      '',
      '- [x] Step 1: `plugins/x/foo.test.ts`',
      '',
    ].join('\n');
    const tasks = findCompletedFixFindingTasks(workplan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.findingId).toBe('AUDIT-20260530-01');
  });
});
