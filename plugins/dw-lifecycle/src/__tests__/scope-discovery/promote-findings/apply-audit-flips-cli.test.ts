/**
 * CLI tests for `dw-lifecycle apply-audit-flips` — Phase 13 Task 4 Step 2.
 *
 * Use real-fs fixtures for the audit-log + workplan; inject a synthetic
 * commit walker so the tests don't need an actual git history.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runApplyAuditFlips,
} from '../../../subcommands/apply-audit-flips.js';
import type {
  CommitWalker,
} from '../../../subcommands/apply-audit-flips.js';

class CaptureStream extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _encoding: string,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    cb(null);
  }
  text(): string {
    return this.chunks.join('');
  }
}

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'apply-flips-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeRepo(name: string, auditLog: string): string {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'audit-log.md'), auditLog, 'utf8');
  return repoRoot;
}

const OPEN_TWO_ENTRIES = [
  '# Audit Log',
  '',
  '### AUDIT-20260529-12 — first open',
  '',
  'Finding-ID: AUDIT-20260529-12',
  'Status: open',
  'Severity: low',
  '',
  'Body.',
  '',
  '### AUDIT-20260529-13 — second open',
  '',
  'Finding-ID: AUDIT-20260529-13',
  'Status: open',
  'Severity: medium',
  '',
  'Body.',
  '',
  '### AUDIT-20260529-14 — already fixed',
  '',
  'Finding-ID: AUDIT-20260529-14',
  'Status: fixed-deadbeef',
  '',
  'Body.',
].join('\n');

describe('parseFlags — apply-audit-flips CLI', () => {
  it('rejects when --feature is missing', () => {
    const r = parseFlags([]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/--feature/);
  });

  it('parses --feature alone (default dry-run)', () => {
    const r = parseFlags(['--feature', 'demo']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.featureSlug).toBe('demo');
    expect(r.opts.apply).toBe(false);
  });

  it('parses --apply', () => {
    const r = parseFlags(['--feature', 'demo', '--apply']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.apply).toBe(true);
  });

  it('parses --since', () => {
    const r = parseFlags(['--feature', 'demo', '--since', 'main']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.sinceRef).toBe('main');
  });

  it('parses --commit', () => {
    const r = parseFlags(['--feature', 'demo', '--commit', 'abc1234']);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.opts.commitSha).toBe('abc1234');
  });

  it('rejects --since and --commit together', () => {
    const r = parseFlags([
      '--feature',
      'demo',
      '--since',
      'main',
      '--commit',
      'abc',
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/mutually exclusive/);
  });

  it('rejects unknown flags', () => {
    const r = parseFlags(['--feature', 'demo', '--bogus']);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error).toMatch(/unknown|bogus/);
  });
});

describe('runApplyAuditFlips — dry-run + apply flows', () => {
  it('dry-run reports proposed flips without writing', async () => {
    const repoRoot = makeRepo('dry-run', OPEN_TWO_ENTRIES);
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    const before = readFileSync(auditLogPath, 'utf8');
    const walker: CommitWalker = () => [
      { sha: 'abc1234', message: 'feat: Closes AUDIT-20260529-12' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: false },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stdout.text()).toContain('open → fixed-abc1234  AUDIT-20260529-12');
    expect(stderr.text()).toContain('dry-run');
    // Audit-log untouched.
    expect(readFileSync(auditLogPath, 'utf8')).toBe(before);
  });

  it('--apply writes the audit-log + flips Status', async () => {
    const repoRoot = makeRepo('apply', OPEN_TWO_ENTRIES);
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    const walker: CommitWalker = () => [
      { sha: 'cafebabe', message: 'feat: Closes AUDIT-20260529-12' },
      { sha: 'deadbeef', message: 'feat: Closes AUDIT-20260529-13' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toContain('Status: fixed-cafebabe');
    expect(written).toContain('Status: fixed-deadbeef');
    expect(written).not.toMatch(/Status: open/);
  });

  it('skips already-dispositioned findings (reports without erroring)', async () => {
    const repoRoot = makeRepo('already-fixed', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      { sha: 'newshac1', message: 'feat: Closes AUDIT-20260529-14' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stdout.text()).toContain(
      'skip  (already fixed-deadbeef)  AUDIT-20260529-14',
    );
    // The original audit-log file's fixed-deadbeef entry stays put.
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    expect(readFileSync(auditLogPath, 'utf8')).toContain(
      'Status: fixed-deadbeef',
    );
  });

  it('reports unknown Finding-IDs without erroring', async () => {
    const repoRoot = makeRepo('unknown-id', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      { sha: 'abcd123', message: 'feat: Closes AUDIT-20260529-99' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stdout.text()).toContain(
      'skip  (no such Finding-ID in audit-log)  AUDIT-20260529-99',
    );
  });

  it('handles a commit with no Closes-AUDIT references (no-op when dry-run)', async () => {
    const repoRoot = makeRepo('no-refs', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      { sha: 'docsonly', message: 'docs: README polish' },
    ];
    const stderr = new CaptureStream();
    const stdout = new CaptureStream();
    // Dry-run: early-return with the "nothing to do" message. Apply mode
    // falls through to the orphan-sweep step (covered by its own test).
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo' },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    expect(stderr.text()).toContain('no Closes-AUDIT references');
  });

  it('flips multiple AUDIT ids from a single multi-finding commit', async () => {
    const repoRoot = makeRepo('multi-cite', OPEN_TWO_ENTRIES);
    const walker: CommitWalker = () => [
      {
        sha: 'multif1',
        message: [
          'feat: combo fix',
          '',
          'Closes: AUDIT-20260529-12, AUDIT-20260529-13',
        ].join('\n'),
      },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    const auditLogPath = join(
      repoRoot,
      'docs',
      '1.0',
      '001-IN-PROGRESS',
      'demo',
      'audit-log.md',
    );
    const written = readFileSync(auditLogPath, 'utf8');
    expect(written).toContain('Status: fixed-multif1');
    expect(written.match(/Status: fixed-multif1/g)?.length).toBe(2);
  });

  it('exits 2 when the feature root is not found', async () => {
    const repoRoot = join(workDir, 'no-feature');
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'nope', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: () => [],
    });
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/not found/);
  });

  /**
   * AUDIT-20260530-14 regression: when apply-audit-flips writes the
   * audit-log status `open → fixed-<sha>`, the corresponding workplan
   * fix-finding task's closure-criterion checkbox stays `- [ ]`.
   * `findUncheckedTasksInOrder` then still treats the task as
   * unchecked, even though every action has been completed. Fix:
   * apply-audit-flips ALSO ticks the closure-criterion checkbox in
   * the matching workplan task block.
   */
  it('returns NON-ZERO exit when the workplan-side write fails (AUDIT-20260530-17)', async () => {
    // Per AUDIT-20260530-17: workplan-tick was best-effort post-fix
    // (audit-log written, workplan write fails, exit 0 with warning).
    // That preserved the AUDIT-14 failure mode: audit-log says fixed,
    // workplan checkbox still `- [ ]`. Hard-error on workplan write
    // failure so the operator at least sees the split-state.
    const repoRoot = makeRepo('hard-error', OPEN_TWO_ENTRIES);
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    // Pre-existing workplan with a matching fix-task closure criterion.
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '',
        '## Phase 13: x',
        '',
        '### Task 13.1 (fix-finding-AUDIT-20260529-12): first',
        '',
        '- [x] step',
        '',
        '**Acceptance Criteria:**',
        '',
        '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
        '',
      ].join('\n'),
      'utf8',
    );
    const walker: CommitWalker = () => [
      { sha: 'closesha', message: 'fix: Closes AUDIT-20260529-12' },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const workplanPath = join(featureDir, 'workplan.md');
    // Inject a write seam that THROWS only for the workplan path.
    // Audit-log write still goes through fs (default writer).
    const writerWithWorkplanFailure = async (
      path: string,
      content: string,
    ): Promise<void> => {
      if (path === workplanPath) {
        throw new Error('synthetic workplan write failure');
      }
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, content, 'utf8');
    };
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
      write: writerWithWorkplanFailure,
    });
    // Hard error per AUDIT-17.
    expect(exit).not.toBe(0);
    // Operator visibility: stderr names the failure.
    expect(stderr.text()).toMatch(/workplan|synthetic/i);

    // AUDIT-20260531-02 regression: the split-state is verifiable —
    // audit-log was written (status fixed-closesha) but workplan
    // checkbox stayed `- [ ]` because the write threw.
    const auditLogAfterFail = readFileSync(
      join(featureDir, 'audit-log.md'),
      'utf8',
    );
    expect(auditLogAfterFail).toContain('Status: fixed-closesha');
    const workplanAfterFail = readFileSync(workplanPath, 'utf8');
    expect(workplanAfterFail).toContain('- [ ] Audit-log Status flipped to');
  });

  it('AUTO-recovers from a workplan write failure on re-run — tool catchup, not manual (AUDIT-20260531-07)', async () => {
    // Per AUDIT-20260531-07: the previous version of this test
    // pre-flipped the workplan checkbox manually before the
    // second run, so it asserted idempotency (no-op on already-
    // flipped box) rather than the tool's catchup-on-still-
    // unchecked-box. The AUDIT-17 fix's catchup branch is supposed
    // to re-process already-dispositioned entries and flip any
    // workplan checkbox still `- [ ]`. This test exercises THAT
    // contract: between the failing-writer first run and the
    // working-writer second run, the operator does NOTHING; the
    // tool's catchup is what flips the box.
    const repoRoot = makeRepo('auto-recovery', OPEN_TWO_ENTRIES);
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    const workplanPath = join(featureDir, 'workplan.md');
    writeFileSync(
      workplanPath,
      [
        '# Workplan',
        '',
        '## Phase 13: x',
        '',
        '### Task 13.1 (fix-finding-AUDIT-20260529-12): first',
        '',
        '- [x] step',
        '',
        '**Acceptance Criteria:**',
        '',
        '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
        '',
      ].join('\n'),
      'utf8',
    );
    const walker: CommitWalker = () => [
      { sha: 'recsha', message: 'fix: Closes AUDIT-20260529-12' },
    ];

    // First run — failing writer for the workplan.
    const failingWriter = async (
      path: string,
      content: string,
    ): Promise<void> => {
      if (path === workplanPath) {
        throw new Error('synthetic write failure');
      }
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, content, 'utf8');
    };
    const stdout1 = new CaptureStream();
    const stderr1 = new CaptureStream();
    const exit1 = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout1 as unknown as NodeJS.WriteStream,
      stderr: stderr1 as unknown as NodeJS.WriteStream,
      commitWalker: walker,
      write: failingWriter,
    });
    expect(exit1).not.toBe(0);
    // Audit-log fixed but workplan unchecked.
    expect(readFileSync(join(featureDir, 'audit-log.md'), 'utf8')).toContain(
      'Status: fixed-recsha',
    );
    const wpAfterFirstRun = readFileSync(workplanPath, 'utf8');
    expect(wpAfterFirstRun).toContain('- [ ] Audit-log Status flipped to');
    expect(wpAfterFirstRun).not.toContain('- [x] Audit-log Status flipped to');

    // NO operator intervention between runs — the workplan checkbox
    // stays `- [ ]` going into the second run. The tool's catchup
    // branch is what we're testing.

    // Second run — working writer. apply-audit-flips re-runs;
    // audit-log status is already `fixed-recsha` so the finding
    // is `already-dispositioned`; the catchup branch processes
    // already-dispositioned entries; finds the unchecked workplan
    // checkbox; FLIPS IT (the auto-recovery).
    const stdout2 = new CaptureStream();
    const stderr2 = new CaptureStream();
    const exit2 = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout2 as unknown as NodeJS.WriteStream,
      stderr: stderr2 as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit2).toBe(0);
    // Auto-recovery: tool flipped the box on its own.
    const wpAfterSecondRun = readFileSync(workplanPath, 'utf8');
    expect(wpAfterSecondRun).toContain('- [x] Audit-log Status flipped to');
    expect(wpAfterSecondRun).not.toContain('- [ ] Audit-log Status flipped to');
    // The re-run reported the finding as already-dispositioned (on
    // the audit-log side) AND flipped the workplan checkbox.
    expect(stdout2.text() + stderr2.text()).toMatch(/already.*fixed/i);
    expect(stderr2.text()).toMatch(/closure-criterion checkbox/);
  });

  it('ticks the workplan closure-criterion checkbox for each flipped finding (AUDIT-20260530-14)', async () => {
    const repoRoot = makeRepo('tick-criterion', OPEN_TWO_ENTRIES);
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    // Write a workplan with TWO fix-tasks matching the open findings.
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '',
        '## Phase 13: x',
        '',
        '### Task 13.1 (fix-finding-AUDIT-20260529-12): first',
        '',
        '- [x] Step 1: write failing test',
        '- [x] Step 2: confirm fails',
        '- [x] Step 3: implement',
        '- [x] Step 4: confirm passes',
        '- [x] Step 5: commit',
        '',
        '**Acceptance Criteria:**',
        '',
        '- [x] Failing test exists',
        '- [x] vitest exits 0',
        '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
        '',
        '### Task 13.2 (fix-finding-AUDIT-20260529-13): second',
        '',
        '- [x] Step 1',
        '- [x] Step 2',
        '- [x] Step 3',
        '- [x] Step 4',
        '- [x] Step 5',
        '',
        '**Acceptance Criteria:**',
        '',
        '- [x] Failing test',
        '- [x] vitest exits 0',
        '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
        '',
      ].join('\n'),
      'utf8',
    );
    const walker: CommitWalker = () => [
      {
        sha: 'closesha',
        message: 'fix: address findings\n\nCloses: AUDIT-20260529-12, AUDIT-20260529-13',
      },
    ];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    const wpAfter = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    // Both closure criteria should now be `- [x]`.
    const checkedClosureLines = (wpAfter.match(/- \[x\] Audit-log Status flipped to `fixed-/g) ?? []).length;
    expect(checkedClosureLines).toBe(2);
    const uncheckedClosureLines = (wpAfter.match(/- \[ \] Audit-log Status flipped to `fixed-/g) ?? []).length;
    expect(uncheckedClosureLines).toBe(0);
  });

  // Orphan-sweep: when a workplan task block matches a finding whose
  // audit-log Status is `acknowledged-*` / `verified-*` / `informational`
  // (NOT `fixed-<sha>`), the task is SUPERSEDED — none of its TDD steps
  // were walked because the finding was dispositioned via a different
  // path (bulk-acknowledge, direct edit). Tick ALL boxes in the block
  // and inject a one-line supersession annotation so the gate stops
  // counting it as unchecked.
  //
  // This sweeps the historical orphan backlog (57 task blocks from the
  // 2026-06-01 v0.31.2-on-PATH bulk-dispose) on a single --apply pass
  // and prevents recurrence of the same shape going forward.
  it('sweeps orphan task blocks when audit-log Status is `acknowledged-*` (the bulk-dispose backlog)', async () => {
    const repoRoot = makeRepo('sweep-orphan', [
      '# Audit Log',
      '',
      '### AUDIT-20260601-10 — historical pre-phase18',
      '',
      'Finding-ID: AUDIT-20260601-10',
      'Status: acknowledged-historical-pre-phase18-2026-06-01',
      'Severity: low',
      '',
      'Body.',
      '',
      '### AUDIT-20260601-11 — cosmetic convention',
      '',
      'Finding-ID: AUDIT-20260601-11',
      'Status: acknowledged-cosmetic-convention-2026-06-01',
      'Severity: low',
      '',
      'Body.',
    ].join('\n'));
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    // Workplan with orphan fix-task blocks — ALL boxes unchecked
    // because the finding was bulk-acknowledged via a direct audit-log
    // edit; no commit walked the workplan steps.
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '',
        '## Phase 13: x',
        '',
        '### Task 13.10 (fix-finding-AUDIT-20260601-10): orphan A',
        '',
        '- [ ] Step 1: write failing test',
        '- [ ] Step 2: confirm fails',
        '- [ ] Step 3: implement',
        '- [ ] Step 4: confirm passes',
        '- [ ] Step 5: commit',
        '',
        '**Acceptance Criteria:**',
        '',
        '- [ ] Failing test exists',
        '- [ ] vitest exits 0',
        '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
        '',
        '### Task 13.11 (fix-finding-AUDIT-20260601-11): orphan B',
        '',
        '- [ ] Step 1',
        '- [ ] Step 2',
        '- [ ] Step 3',
        '- [ ] Step 4',
        '- [ ] Step 5',
        '',
        '**Acceptance Criteria:**',
        '',
        '- [ ] Failing test',
        '- [ ] vitest exits 0',
        '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
        '',
      ].join('\n'),
      'utf8',
    );
    // No commits cite these findings; the only path to closure is the
    // already-dispositioned sweep at --apply time.
    const walker: CommitWalker = () => [];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    const wpAfter = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    // Both orphan blocks should now have ZERO `- [ ]` lines.
    const remainingUnchecked = (wpAfter.match(/- \[ \]/g) ?? []).length;
    expect(remainingUnchecked).toBe(0);
    // Supersession annotation present for each orphan, naming the disposition.
    expect(wpAfter).toMatch(/superseded.*acknowledged-historical-pre-phase18/i);
    expect(wpAfter).toMatch(/superseded.*acknowledged-cosmetic-convention/i);
  });

  // Regression-lock: a `fixed-<sha>` task whose Steps 1-5 ARE checked
  // (the existing-test contract) should NOT receive the supersession
  // annotation. The annotation is for orphan blocks (no TDD work
  // performed); `fixed-<sha>` blocks had real TDD walked.
  it('does NOT inject supersession annotation when the task block is a real fix (Steps walked)', async () => {
    const repoRoot = makeRepo('fixed-not-superseded', [
      '# Audit Log',
      '',
      '### AUDIT-20260529-20 — real fix',
      '',
      'Finding-ID: AUDIT-20260529-20',
      'Status: fixed-cafef00d',
      'Severity: medium',
      '',
      'Body.',
    ].join('\n'));
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    writeFileSync(
      join(featureDir, 'workplan.md'),
      [
        '# Workplan',
        '',
        '## Phase 13',
        '',
        '### Task 13.20 (fix-finding-AUDIT-20260529-20): real fix',
        '',
        '- [x] Step 1: write failing test',
        '- [x] Step 2: confirm fails',
        '- [x] Step 3: implement',
        '- [x] Step 4: confirm passes',
        '- [x] Step 5: commit',
        '',
        '**Acceptance Criteria:**',
        '',
        '- [x] Failing test exists',
        '- [x] vitest exits 0',
        '- [ ] Audit-log Status flipped to `fixed-<sha>` via the close-shipped-audit-findings step',
        '',
      ].join('\n'),
      'utf8',
    );
    const walker: CommitWalker = () => [];
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const exit = await runApplyAuditFlips({
      opts: { featureSlug: 'demo', apply: true },
      projectRoot: repoRoot,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      commitWalker: walker,
    });
    expect(exit).toBe(0);
    const wpAfter = readFileSync(join(featureDir, 'workplan.md'), 'utf8');
    expect(wpAfter).not.toMatch(/superseded/i);
    // Closure criterion was ticked.
    expect(wpAfter).toContain('- [x] Audit-log Status flipped to `fixed-<sha>`');
  });
});
