import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import {
  parseCloseShippedArgs,
  runCloseShipped,
} from '../subcommands/close-shipped.js';
import { defaultConfig } from '../config.js';
import type { Config } from '../config.types.js';
import type { RunGh, RunGit } from '../close-shipped/types.js';

const TEST_CONFIG: Config = defaultConfig();

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

function streamToString(stream: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

interface RepoState {
  readonly tags: readonly string[];
  readonly commits: ReadonlyArray<{
    readonly sha: string;
    readonly subject: string;
    readonly body: string;
  }>;
  // Map "from..to" -> count
  readonly revCounts: Record<string, number>;
}

function mockGit(state: RepoState): RunGit {
  return (args) => {
    if (args[0] === 'tag' && args[1] === '--list') {
      return state.tags.join('\n');
    }
    if (args[0] === 'rev-parse' && args[1] === '--verify') {
      const refArg = args[2] ?? '';
      const tag = refArg.replace(/^refs\/tags\//, '');
      if (!state.tags.includes(tag)) throw new Error('not found');
      return 'sha';
    }
    if (args[0] === 'rev-list' && args[1] === '--count') {
      const range = args[2] ?? '';
      const count = state.revCounts[range] ?? 0;
      return `${count}\n`;
    }
    if (args[0] === 'log') {
      return state.commits
        .map(
          (c) =>
            `${c.sha}${FIELD_SEPARATOR}${c.subject}${FIELD_SEPARATOR}${c.body}${RECORD_SEPARATOR}`,
        )
        .join('');
    }
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  };
}

interface MockGhSpec {
  readonly state?: Record<number, 'OPEN' | 'CLOSED'>;
  readonly labels?: Record<number, readonly string[]>;
}

function mockGh(spec: MockGhSpec = {}): {
  runGh: RunGh;
  calls: ReadonlyArray<readonly string[]>;
} {
  const calls: string[][] = [];
  const runGh: RunGh = (args) => {
    calls.push([...args]);
    if (args[0] === 'issue' && args[1] === 'view') {
      const num = Number.parseInt(args[2] ?? '0', 10);
      const state = spec.state?.[num] ?? 'OPEN';
      const labels = (spec.labels?.[num] ?? []).map((name) => ({ name }));
      return JSON.stringify({ state, labels });
    }
    return '';
  };
  return { runGh, calls };
}

describe('parseCloseShippedArgs', () => {
  it('parses no arguments with defaults', () => {
    const opts = parseCloseShippedArgs([]);
    expect(opts.fromTag).toBeNull();
    expect(opts.toTag).toBeNull();
    expect(opts.repo).toBeNull();
    expect(opts.label).toBe('pending-verification');
    expect(opts.dryRun).toBe(false);
  });

  it('parses --from-tag and --to-tag', () => {
    const opts = parseCloseShippedArgs([
      '--from-tag',
      'v1.0.0',
      '--to-tag',
      'v1.1.0',
    ]);
    expect(opts.fromTag).toBe('v1.0.0');
    expect(opts.toTag).toBe('v1.1.0');
  });

  it('parses --repo', () => {
    const opts = parseCloseShippedArgs(['--repo', 'owner/repo']);
    expect(opts.repo).toBe('owner/repo');
  });

  it('parses --label', () => {
    const opts = parseCloseShippedArgs(['--label', 'shipped']);
    expect(opts.label).toBe('shipped');
  });

  it('parses --dry-run', () => {
    const opts = parseCloseShippedArgs(['--dry-run']);
    expect(opts.dryRun).toBe(true);
  });

  it('parses --release-notes-body', () => {
    const opts = parseCloseShippedArgs(['--release-notes-body']);
    expect(opts.releaseNotesBody).toBe(true);
  });

  it('defaults --release-notes-body to false', () => {
    const opts = parseCloseShippedArgs([]);
    expect(opts.releaseNotesBody).toBe(false);
  });

  it('throws when --from-tag has no value', () => {
    expect(() => parseCloseShippedArgs(['--from-tag'])).toThrow(
      /--from-tag requires/,
    );
  });

  it('throws on unknown flag', () => {
    expect(() => parseCloseShippedArgs(['--unknown'])).toThrow(/Unknown flag/);
  });

  it('throws on unexpected positional argument', () => {
    expect(() => parseCloseShippedArgs(['extra'])).toThrow(
      /Unexpected positional argument/,
    );
  });

  it('throws when --label is empty', () => {
    expect(() => parseCloseShippedArgs(['--label', ''])).toThrow(/cannot be empty/);
  });
});

describe('runCloseShipped', () => {
  it('dry-run prints plan without invoking gh', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutPromise = streamToString(stdout);
    const repoState: RepoState = {
      tags: ['v1.0.0', 'v1.1.0'],
      commits: [
        // Phase 13: parens / plain dropped from extraction. Both fixtures
        // use explicit fix verbs so the test exercises the dry-run
        // orchestration without depending on the deprecated permissive
        // matching.
        { sha: 'aaa1234', subject: 'feat: x', body: 'Resolves #42' },
        { sha: 'bbb5678', subject: 'fix: y', body: 'Closes #43' },
      ],
      revCounts: { 'v1.0.0..v1.1.0': 2, 'v1.1.0..v1.0.0': 0 },
    };
    const runGit = mockGit(repoState);
    const { runGh, calls } = mockGh();
    const code = runCloseShipped({
      opts: {
        fromTag: null,
        toTag: null,
        repo: 'owner/repo',
        label: 'pending-verification',
        dryRun: true,
        releaseNotesBody: false,
      },
      projectRoot: '/tmp/test',
      config: TEST_CONFIG,
      runGh,
      runGit,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      detectRepo: () => 'owner/repo',
    });
    stdout.end();
    stderr.end();
    expect(code).toBe(0);
    const out = await stdoutPromise;
    expect(out).toContain('Dry-run plan for v1.0.0..v1.1.0');
    expect(out).toContain('Commits scanned: 2');
    expect(out).toContain('Issues referenced: 2');
    expect(out).toContain('#42');
    expect(out).toContain('#43');
    // gh should never have been called in dry-run.
    expect(calls.length).toBe(0);
  });

  it('apply step: comments and labels each open issue', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutPromise = streamToString(stdout);
    const repoState: RepoState = {
      tags: ['v1.0.0', 'v1.1.0'],
      // Phase 13: parens dropped — switched fixture to use Closes verb.
      commits: [{ sha: 'aaa1234', subject: 'fix: thing', body: 'Closes #10' }],
      revCounts: { 'v1.0.0..v1.1.0': 1, 'v1.1.0..v1.0.0': 0 },
    };
    const runGit = mockGit(repoState);
    const { runGh, calls } = mockGh();
    const code = runCloseShipped({
      opts: {
        fromTag: null,
        toTag: null,
        repo: 'owner/repo',
        label: 'pending-verification',
        dryRun: false,
        releaseNotesBody: false,
      },
      projectRoot: '/tmp/test',
      config: TEST_CONFIG,
      runGh,
      runGit,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      detectRepo: () => 'owner/repo',
    });
    stdout.end();
    stderr.end();
    expect(code).toBe(0);
    const out = await stdoutPromise;
    expect(out).toContain('Applied: 1');
    expect(out).toContain('Range: v1.0.0..v1.1.0');
    // 3 gh calls expected: view + comment + edit.
    expect(calls.length).toBe(3);
  });

  it('exits 2 on missing tags', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stderrPromise = streamToString(stderr);
    const repoState: RepoState = {
      tags: [],
      commits: [],
      revCounts: {},
    };
    const runGit = mockGit(repoState);
    const { runGh } = mockGh();
    const code = runCloseShipped({
      opts: {
        fromTag: null,
        toTag: null,
        repo: 'owner/repo',
        label: 'pending-verification',
        dryRun: false,
        releaseNotesBody: false,
      },
      projectRoot: '/tmp/test',
      config: TEST_CONFIG,
      runGh,
      runGit,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      detectRepo: () => 'owner/repo',
    });
    stdout.end();
    stderr.end();
    expect(code).toBe(2);
    const err = await stderrPromise;
    expect(err).toContain('No `v*` tags');
  });

  it('exits 2 on reversed range', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stderrPromise = streamToString(stderr);
    const repoState: RepoState = {
      tags: ['v1.0.0', 'v1.1.0'],
      commits: [],
      revCounts: { 'v1.1.0..v1.0.0': 0, 'v1.0.0..v1.1.0': 5 },
    };
    const runGit = mockGit(repoState);
    const { runGh } = mockGh();
    const code = runCloseShipped({
      opts: {
        fromTag: 'v1.1.0',
        toTag: 'v1.0.0',
        repo: 'owner/repo',
        label: 'pending-verification',
        dryRun: false,
        releaseNotesBody: false,
      },
      projectRoot: '/tmp/test',
      config: TEST_CONFIG,
      runGh,
      runGit,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      detectRepo: () => 'owner/repo',
    });
    stdout.end();
    stderr.end();
    expect(code).toBe(2);
    const err = await stderrPromise;
    expect(err).toContain('Reversed tag range');
  });

  it('skips already-closed issues with exit 0', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutPromise = streamToString(stdout);
    const repoState: RepoState = {
      tags: ['v1.0.0', 'v1.1.0'],
      // Phase 13: parens dropped — switched fixture to use Fixes verb.
      commits: [{ sha: 'aaa1234', subject: 'fix: closed-already', body: 'Fixes #77' }],
      revCounts: { 'v1.0.0..v1.1.0': 1, 'v1.1.0..v1.0.0': 0 },
    };
    const runGit = mockGit(repoState);
    const { runGh, calls } = mockGh({
      state: { 77: 'CLOSED' },
    });
    const code = runCloseShipped({
      opts: {
        fromTag: null,
        toTag: null,
        repo: 'owner/repo',
        label: 'pending-verification',
        dryRun: false,
        releaseNotesBody: false,
      },
      projectRoot: '/tmp/test',
      config: TEST_CONFIG,
      runGh,
      runGit,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      detectRepo: () => 'owner/repo',
    });
    stdout.end();
    stderr.end();
    expect(code).toBe(0);
    const out = await stdoutPromise;
    expect(out).toContain('skipped-already-closed');
    // Only the state-check call. No comment or label.
    expect(calls.length).toBe(1);
  });

  it('emits release-notes body when --release-notes-body is set', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutPromise = streamToString(stdout);
    const repoState: RepoState = {
      tags: ['v1.0.0', 'v1.1.0'],
      // Phase 13: parens dropped — switched fixture to use Closes verb.
      commits: [{ sha: 'aaa1234', subject: 'fix: thing', body: 'Closes #10' }],
      revCounts: { 'v1.0.0..v1.1.0': 1, 'v1.1.0..v1.0.0': 0 },
    };
    const runGit = mockGit(repoState);
    const { runGh, calls } = mockGh();
    const code = runCloseShipped({
      opts: {
        fromTag: null,
        toTag: null,
        repo: 'owner/repo',
        label: 'pending-verification',
        dryRun: false,
        releaseNotesBody: true,
      },
      projectRoot: '/tmp/test',
      config: TEST_CONFIG,
      runGh,
      runGit,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      detectRepo: () => 'owner/repo',
    });
    stdout.end();
    stderr.end();
    expect(code).toBe(0);
    const out = await stdoutPromise;
    expect(out).toContain('## Pending verification');
    expect(out).toContain('- #10');
    expect(out).toContain('To verify: install v1.1.0');
    // gh should never be called when emitting the body.
    expect(calls.length).toBe(0);
  });

  it('exits 0 when no issue references found', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutPromise = streamToString(stdout);
    const repoState: RepoState = {
      tags: ['v1.0.0', 'v1.1.0'],
      commits: [
        { sha: 'aaa1234', subject: 'chore: noise', body: 'no refs' },
        { sha: 'bbb5678', subject: 'chore: more noise', body: 'still none' },
      ],
      revCounts: { 'v1.0.0..v1.1.0': 2, 'v1.1.0..v1.0.0': 0 },
    };
    const runGit = mockGit(repoState);
    const { runGh, calls } = mockGh();
    const code = runCloseShipped({
      opts: {
        fromTag: null,
        toTag: null,
        repo: 'owner/repo',
        label: 'pending-verification',
        dryRun: false,
        releaseNotesBody: false,
      },
      projectRoot: '/tmp/test',
      config: TEST_CONFIG,
      runGh,
      runGit,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      detectRepo: () => 'owner/repo',
    });
    stdout.end();
    stderr.end();
    expect(code).toBe(0);
    const out = await stdoutPromise;
    expect(out).toContain('Issues referenced: 0');
    expect(calls.length).toBe(0);
  });
});
