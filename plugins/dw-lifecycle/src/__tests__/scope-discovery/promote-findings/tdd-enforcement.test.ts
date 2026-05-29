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
