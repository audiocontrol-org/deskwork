/**
 * Doctor rule test — fix-task-tdd-discipline.
 *
 * Real-fs fixtures: tmp repo with workplan + (sometimes) test files;
 * invoke the rule's check function; assert findings.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../../../scope-discovery/doctor-rules/fix-task-tdd-discipline.js';

let workDir: string;
beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'doctor-tdd-'));
});
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string, workplan: string): string {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'workplan.md'), workplan, 'utf8');
  return repoRoot;
}

function writeTestFile(repoRoot: string, relPath: string, content = 'export {}\n'): void {
  const full = join(repoRoot, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

const WORKPLAN_WITH_CHECKED_TASK = [
  '## Phase 14',
  '',
  '### Task 14.1: Quiet noise (fix-finding-AUDIT-20260529-12)',
  '',
  'Body.',
  '',
  '- [x] Step 1: tests at `plugins/x/foo.test.ts`',
  '- [x] Step 2: implementation',
].join('\n');

describe('fix-task-tdd-discipline doctor rule', () => {
  it("returns NO findings when checked task has existing non-empty test file", async () => {
    const repoRoot = makeRepo('happy', WORKPLAN_WITH_CHECKED_TASK);
    writeTestFile(repoRoot, 'plugins/x/foo.test.ts');
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it("flags missing test file for checked fix-finding task", async () => {
    const repoRoot = makeRepo('missing-test', WORKPLAN_WITH_CHECKED_TASK);
    // No test file written.
    const findings = await check({ repoRoot });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('plugins/x/foo.test.ts');
    expect(findings[0]?.message).toContain('does not exist');
    expect(findings[0]?.message).toContain('AUDIT-20260529-12');
  });

  it("flags empty test file for checked fix-finding task", async () => {
    const repoRoot = makeRepo('empty-test', WORKPLAN_WITH_CHECKED_TASK);
    writeTestFile(repoRoot, 'plugins/x/foo.test.ts', '');
    const findings = await check({ repoRoot });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('empty');
  });

  it("flags checked fix-finding task without a cited test file", async () => {
    const workplan = [
      '### Task 14.1: No test cited (fix-finding-AUDIT-20260529-99)',
      '- [x] Step 1: do the thing',
    ].join('\n');
    const repoRoot = makeRepo('no-citation', workplan);
    const findings = await check({ repoRoot });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('no test file');
    expect(findings[0]?.message).toContain('AUDIT-20260529-99');
  });

  it("returns NO findings when fix-finding tasks exist but none are checked", async () => {
    const workplan = [
      '### Task 14.1: Not done yet (fix-finding-AUDIT-20260529-12)',
      '- [ ] Step 1: tests at `plugins/x/foo.test.ts`',
    ].join('\n');
    const repoRoot = makeRepo('not-checked', workplan);
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it("returns NO findings when no fix-finding tasks exist at all", async () => {
    const workplan = '## Phase\n\n### Task 1: Unrelated\n\n- [x] Done\n';
    const repoRoot = makeRepo('no-fix-tasks', workplan);
    const findings = await check({ repoRoot });
    expect(findings).toEqual([]);
  });

  it("walks multiple features under docs/<v>/001-IN-PROGRESS/", async () => {
    const repoRoot = join(workDir, 'multi-feature');
    const dirs = [
      join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'feat-a'),
      join(repoRoot, 'docs', '0.19.0', '001-IN-PROGRESS', 'feat-b'),
    ];
    for (const d of dirs) mkdirSync(d, { recursive: true });
    writeFileSync(join(dirs[0]!, 'workplan.md'), WORKPLAN_WITH_CHECKED_TASK, 'utf8');
    writeFileSync(
      join(dirs[1]!, 'workplan.md'),
      [
        '### Task 1: B (fix-finding-AUDIT-20260530-01)',
        '- [x] Step 1: tests at `plugins/y/bar.test.ts`',
      ].join('\n'),
      'utf8',
    );
    const findings = await check({ repoRoot });
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.message).join('\n')).toContain("'feat-a'");
    expect(findings.map((f) => f.message).join('\n')).toContain("'feat-b'");
  });
});
