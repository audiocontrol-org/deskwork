/**
 * CLI tests for the check-fix-task-tdd commit-msg gate. Uses an
 * injected vitest runner so we don't recurse.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runCheckFixTaskTdd,
} from '../../../subcommands/check-fix-task-tdd.js';
import type { VitestRunner } from '../../../scope-discovery/promote-findings/tdd-enforcement.js';

class CaptureStream extends Writable {
  chunks: string[] = [];
  override _write(chunk: Buffer | string, _enc: string, cb: (err?: Error | null) => void): void {
    this.chunks.push(chunk.toString());
    cb(null);
  }
  text(): string {
    return this.chunks.join('');
  }
}

let workDir: string;
beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'check-tdd-'));
});
afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const WORKPLAN = [
  '## Phase 14',
  '',
  '### Task 14.1: Fix the bug (fix-finding-AUDIT-20260529-12)',
  '',
  '- [x] Step 1: tests at `plugins/x/foo.test.ts`',
  '- [x] Step 2: impl',
].join('\n');

function makeRepo(
  name: string,
  commitMsg: string,
  options?: { writeTestFile?: boolean; emptyTestFile?: boolean },
): { repoRoot: string; commitMsgPath: string } {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'workplan.md'), WORKPLAN, 'utf8');
  if (options?.writeTestFile !== false) {
    const testFile = join(repoRoot, 'plugins/x/foo.test.ts');
    mkdirSync(join(testFile, '..'), { recursive: true });
    writeFileSync(testFile, options?.emptyTestFile === true ? '' : 'export {}\n', 'utf8');
  }
  const commitMsgPath = join(repoRoot, '.commit-msg');
  writeFileSync(commitMsgPath, commitMsg, 'utf8');
  return { repoRoot, commitMsgPath };
}

describe('parseFlags — check-fix-task-tdd CLI', () => {
  it('rejects without --commit-msg-file', () => {
    const r = parseFlags([]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--commit-msg-file/);
  });

  it('parses --commit-msg-file + --skip-vitest + --feature', () => {
    const r = parseFlags([
      '--commit-msg-file',
      '/tmp/m',
      '--skip-vitest',
      '--feature',
      'demo',
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.commitMsgFile).toBe('/tmp/m');
    expect(r.opts.skipVitest).toBe(true);
    expect(r.opts.featureSlug).toBe('demo');
  });
});

describe('runCheckFixTaskTdd — gate behavior', () => {
  it("exit 0 when commit has NO Closes-AUDIT references", async () => {
    const { repoRoot, commitMsgPath } = makeRepo('no-closes', 'docs: README polish');
    const exit = await runCheckFixTaskTdd({
      opts: { commitMsgFile: commitMsgPath, skipVitest: true },
      projectRoot: repoRoot,
      stdout: new CaptureStream() as unknown as NodeJS.WriteStream,
      stderr: new CaptureStream() as unknown as NodeJS.WriteStream,
    });
    expect(exit).toBe(0);
  });

  it("exit 0 when Closes-AUDIT matches checked task with existing test file", async () => {
    const { repoRoot, commitMsgPath } = makeRepo(
      'happy',
      'feat: Closes AUDIT-20260529-12',
    );
    const stub: VitestRunner = async () => ({ exitCode: 0, output: '' });
    const exit = await runCheckFixTaskTdd({
      opts: { commitMsgFile: commitMsgPath },
      projectRoot: repoRoot,
      stdout: new CaptureStream() as unknown as NodeJS.WriteStream,
      stderr: new CaptureStream() as unknown as NodeJS.WriteStream,
      runVitest: stub,
    });
    expect(exit).toBe(0);
  });

  it("exit 1 when vitest fails for the cited test", async () => {
    const { repoRoot, commitMsgPath } = makeRepo(
      'vitest-fail',
      'feat: Closes AUDIT-20260529-12',
    );
    const stub: VitestRunner = async () => ({ exitCode: 1, output: 'FAIL: 1 test failed' });
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runCheckFixTaskTdd({
      opts: { commitMsgFile: commitMsgPath },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      runVitest: stub,
    });
    expect(exit).toBe(1);
    expect(stdout.text()).toContain('AUDIT-20260529-12');
    expect(stdout.text()).toContain('FAIL');
    expect(stdout.text()).toContain('test-failing');
  });

  it("exit 1 when cited test file does not exist", async () => {
    const { repoRoot, commitMsgPath } = makeRepo(
      'missing-test',
      'feat: Closes AUDIT-20260529-12',
      { writeTestFile: false },
    );
    const stdout = new CaptureStream();
    const exit = await runCheckFixTaskTdd({
      opts: { commitMsgFile: commitMsgPath, skipVitest: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: new CaptureStream() as unknown as NodeJS.WriteStream,
    });
    expect(exit).toBe(1);
    expect(stdout.text()).toContain('missing-test-file');
  });

  it("exit 1 when Closes-AUDIT references an AUDIT-id with no [x] fix-finding task", async () => {
    const { repoRoot, commitMsgPath } = makeRepo(
      'no-task',
      'feat: Closes AUDIT-20260529-99',
    );
    const stdout = new CaptureStream();
    const exit = await runCheckFixTaskTdd({
      opts: { commitMsgFile: commitMsgPath, skipVitest: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: new CaptureStream() as unknown as NodeJS.WriteStream,
    });
    expect(exit).toBe(1);
    expect(stdout.text()).toContain('AUDIT-20260529-99');
    expect(stdout.text()).toContain('NOT FOUND');
  });

  it("handles multi-AUDIT commit message (Closes: comma-separated)", async () => {
    const workplan = [
      '### Task 14.1: A (fix-finding-AUDIT-20260529-12)',
      '- [x] Step 1: tests at `plugins/x/a.test.ts`',
      '',
      '### Task 14.2: B (fix-finding-AUDIT-20260529-13)',
      '- [x] Step 1: tests at `plugins/x/b.test.ts`',
    ].join('\n');
    const repoRoot = join(workDir, 'multi-cite');
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'workplan.md'), workplan, 'utf8');
    mkdirSync(join(repoRoot, 'plugins/x'), { recursive: true });
    writeFileSync(join(repoRoot, 'plugins/x/a.test.ts'), 'export {}\n', 'utf8');
    writeFileSync(join(repoRoot, 'plugins/x/b.test.ts'), 'export {}\n', 'utf8');
    const commitMsgPath = join(repoRoot, '.commit-msg');
    writeFileSync(
      commitMsgPath,
      'feat: combo\n\nCloses: AUDIT-20260529-12, AUDIT-20260529-13\n',
      'utf8',
    );
    const stub: VitestRunner = async () => ({ exitCode: 0, output: '' });
    const exit = await runCheckFixTaskTdd({
      opts: { commitMsgFile: commitMsgPath },
      projectRoot: repoRoot,
      stdout: new CaptureStream() as unknown as NodeJS.WriteStream,
      stderr: new CaptureStream() as unknown as NodeJS.WriteStream,
      runVitest: stub,
    });
    expect(exit).toBe(0);
  });
});
