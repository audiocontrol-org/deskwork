import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  parseTriageIssuesArgs,
  runTriageIssues,
} from '../subcommands/triage-issues.js';
import type { ProposalFile } from '../triage-issues/types.js';

describe('parseTriageIssuesArgs', () => {
  it('parses propose with --bucket and default limit', () => {
    const opts = parseTriageIssuesArgs(['propose', '--bucket', 'stale-30d']);
    expect(opts.verb).toBe('propose');
    if (opts.verb !== 'propose') throw new Error('expected propose');
    expect(opts.bucket).toBe('stale-30d');
    expect(opts.limit).toBe(10);
  });

  it('parses propose with --limit and --repo', () => {
    const opts = parseTriageIssuesArgs([
      'propose',
      '--bucket',
      'unlabeled',
      '--limit',
      '25',
      '--repo',
      'foo/bar',
    ]);
    expect(opts.verb).toBe('propose');
    if (opts.verb !== 'propose') throw new Error('expected propose');
    expect(opts.limit).toBe(25);
    expect(opts.repo).toBe('foo/bar');
  });

  it('parses apply with --from-file', () => {
    const opts = parseTriageIssuesArgs([
      'apply',
      '--from-file',
      '/tmp/p.json',
    ]);
    expect(opts.verb).toBe('apply');
    if (opts.verb !== 'apply') throw new Error('expected apply');
    expect(opts.fromFile).toBe('/tmp/p.json');
  });

  it('throws when no verb supplied', () => {
    expect(() => parseTriageIssuesArgs([])).toThrow(/Usage:/);
  });

  it('throws on unknown verb', () => {
    expect(() => parseTriageIssuesArgs(['banana'])).toThrow(/Unknown verb/);
  });

  it('throws when propose has no --bucket', () => {
    expect(() => parseTriageIssuesArgs(['propose'])).toThrow(/--bucket is required/);
  });

  it('throws when apply has no --from-file', () => {
    expect(() => parseTriageIssuesArgs(['apply'])).toThrow(/--from-file is required/);
  });

  it('throws on unknown flag for propose', () => {
    expect(() =>
      parseTriageIssuesArgs(['propose', '--bucket', 'unlabeled', '--banana']),
    ).toThrow(/Unknown flag for propose/);
  });

  it('throws on unknown flag for apply', () => {
    expect(() =>
      parseTriageIssuesArgs(['apply', '--from-file', 'p', '--banana']),
    ).toThrow(/Unknown flag for apply/);
  });
});

function captureStdout(): { stream: NodeJS.WriteStream; collected: () => string } {
  const chunks: string[] = [];
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  stream.write = ((data: unknown): boolean => {
    chunks.push(typeof data === 'string' ? data : String(data));
    return true;
  }) as NodeJS.WriteStream['write'];
  return { stream, collected: () => chunks.join('') };
}

describe('runTriageIssues — propose', () => {
  const now = new Date('2026-05-28T12:00:00.000Z');
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'triage-cli-'));
  });

  it('runs the propose verb end-to-end and writes a markdown table to stdout', () => {
    const runGh = (): string =>
      JSON.stringify([
        {
          number: 42,
          title: 'stale-thing',
          url: 'u',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          body: 'body',
          labels: [],
          comments: [],
        },
      ]);
    const { stream, collected } = captureStdout();
    const outputPath = join(projectRoot, 'p.json');
    const exitCode = runTriageIssues({
      opts: {
        verb: 'propose',
        bucket: 'unlabeled',
        limit: 10,
        repo: 'foo/bar',
        outputPath,
      },
      projectRoot,
      now,
      runGh,
      stdout: stream,
      detectRepo: () => {
        throw new Error('should not detect when --repo supplied');
      },
    });
    expect(exitCode).toBe(0);
    const out = collected();
    expect(out).toMatch(/Wrote proposal:/);
    expect(out).toMatch(/Items: 1/);
    expect(out).toMatch(/#42/);
    expect(out).toMatch(/_\(fill in\)_/);
  });

  it('calls detectRepo when --repo is not supplied', () => {
    let detected = false;
    const runGh = (): string => '[]';
    const { stream } = captureStdout();
    runTriageIssues({
      opts: { verb: 'propose', bucket: 'unlabeled', limit: 10 },
      projectRoot,
      now,
      runGh,
      stdout: stream,
      detectRepo: () => {
        detected = true;
        return 'detected/repo';
      },
    });
    expect(detected).toBe(true);
  });
});

describe('runTriageIssues — apply', () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'triage-apply-cli-'));
  });

  it('reports "Aborted" when approval is "n"', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'n',
      items: [],
    };
    writeFileSync(path, JSON.stringify(file, null, 2));
    const { stream, collected } = captureStdout();
    const code = runTriageIssues({
      opts: { verb: 'apply', fromFile: path },
      projectRoot,
      now: new Date(),
      runGh: () => '',
      stdout: stream,
      detectRepo: () => 'foo/bar',
    });
    expect(code).toBe(0);
    expect(collected()).toMatch(/Aborted by operator approval/);
  });

  it('writes a summary line and per-failure detail to stdout', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'y',
      items: [
        {
          number: 1,
          title: 't',
          url: 'u',
          age_days: 1,
          comment_age_days: null,
          labels: [],
          body_excerpt: '',
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'c' },
          applied: null,
          apply_error: null,
          result: null,
        },
        {
          number: 2,
          title: 't',
          url: 'u',
          age_days: 1,
          comment_age_days: null,
          labels: [],
          body_excerpt: '',
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'c' },
          applied: null,
          apply_error: null,
          result: null,
        },
      ],
    };
    writeFileSync(path, JSON.stringify(file, null, 2));
    let n = 0;
    const runGh = (): string => {
      n += 1;
      if (n === 2) throw new Error('gh: boom');
      return '';
    };
    const { stream, collected } = captureStdout();
    const code = runTriageIssues({
      opts: { verb: 'apply', fromFile: path },
      projectRoot,
      now: new Date(),
      runGh,
      stdout: stream,
      detectRepo: () => 'foo/bar',
    });
    expect(code).toBe(0); // at least one succeeded
    const out = collected();
    expect(out).toMatch(/Applied: 1; Failed: 1; Skipped: 0/);
    expect(out).toMatch(/Failed #2: gh: boom/);
  });

  it('exits 1 when every approved item failed', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'y',
      items: [
        {
          number: 1,
          title: 't',
          url: 'u',
          age_days: 1,
          comment_age_days: null,
          labels: [],
          body_excerpt: '',
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'c' },
          applied: null,
          apply_error: null,
          result: null,
        },
      ],
    };
    writeFileSync(path, JSON.stringify(file, null, 2));
    const runGh = (): string => {
      throw new Error('gh: every call fails');
    };
    const { stream } = captureStdout();
    const code = runTriageIssues({
      opts: { verb: 'apply', fromFile: path },
      projectRoot,
      now: new Date(),
      runGh,
      stdout: stream,
      detectRepo: () => 'foo/bar',
    });
    expect(code).toBe(1);
  });

  it('exits 2 on malformed JSON in the proposal file (Fix 3)', () => {
    const path = join(projectRoot, 'p.json');
    writeFileSync(path, '{ this is not json');
    const stderrChunks: string[] = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    }) as typeof process.stderr.write;
    let calls = 0;
    try {
      const { stream } = captureStdout();
      const code = runTriageIssues({
        opts: { verb: 'apply', fromFile: path },
        projectRoot,
        now: new Date(),
        runGh: () => {
          calls += 1;
          return '';
        },
        stdout: stream,
        detectRepo: () => 'foo/bar',
      });
      expect(code).toBe(2);
      expect(calls).toBe(0);
      expect(stderrChunks.join('')).toMatch(/Could not parse/);
    } finally {
      process.stderr.write = origStderrWrite;
    }
  });

  it('exits 2 when the proposal file is missing required top-level fields (Fix 3)', () => {
    const path = join(projectRoot, 'p.json');
    writeFileSync(path, JSON.stringify({ bucket: 'unlabeled' }));
    const stderrChunks: string[] = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    }) as typeof process.stderr.write;
    let calls = 0;
    try {
      const { stream } = captureStdout();
      const code = runTriageIssues({
        opts: { verb: 'apply', fromFile: path },
        projectRoot,
        now: new Date(),
        runGh: () => {
          calls += 1;
          return '';
        },
        stdout: stream,
        detectRepo: () => 'foo/bar',
      });
      expect(code).toBe(2);
      expect(calls).toBe(0);
      expect(stderrChunks.join('')).toMatch(/not a valid proposal file/);
    } finally {
      process.stderr.write = origStderrWrite;
    }
  });

  it('exits 2 when an approved item has invalid disposition_fields, with NO gh calls (Fix 3 + Fix 1)', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'y',
      items: [
        {
          number: 1,
          title: 't',
          url: 'u',
          age_days: 1,
          comment_age_days: null,
          labels: [],
          body_excerpt: '',
          disposition: 'leave-with-comment',
          disposition_fields: { comment: 'ok' },
          applied: null,
          apply_error: null,
          result: null,
        },
        {
          number: 2,
          title: 't',
          url: 'u',
          age_days: 1,
          comment_age_days: null,
          labels: [],
          body_excerpt: '',
          disposition: 'close-wontfix',
          disposition_fields: { reason: '' },
          applied: null,
          apply_error: null,
          result: null,
        },
      ],
    };
    writeFileSync(path, JSON.stringify(file, null, 2));
    const stderrChunks: string[] = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    }) as typeof process.stderr.write;
    let calls = 0;
    try {
      const { stream } = captureStdout();
      const code = runTriageIssues({
        opts: { verb: 'apply', fromFile: path },
        projectRoot,
        now: new Date(),
        runGh: () => {
          calls += 1;
          return '';
        },
        stdout: stream,
        detectRepo: () => 'foo/bar',
      });
      expect(code).toBe(2);
      // The no-mutation oracle: item 1 had a valid leave-with-comment
      // disposition, but item 2's malformed close-wontfix aborts the
      // whole batch before either is dispatched.
      expect(calls).toBe(0);
      expect(stderrChunks.join('')).toMatch(/Item 2/);
    } finally {
      process.stderr.write = origStderrWrite;
    }
  });

  it('rewrites the file with applied + result fields after a successful run', () => {
    const path = join(projectRoot, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      bucket: 'unlabeled',
      query: 'state:open no:label',
      repo: 'foo/bar',
      approval: 'y',
      items: [
        {
          number: 99,
          title: 't',
          url: 'u',
          age_days: 1,
          comment_age_days: null,
          labels: [],
          body_excerpt: '',
          disposition: 'label',
          disposition_fields: { labels: ['priority:low'] },
          applied: null,
          apply_error: null,
          result: null,
        },
      ],
    };
    writeFileSync(path, JSON.stringify(file, null, 2));
    const { stream } = captureStdout();
    runTriageIssues({
      opts: { verb: 'apply', fromFile: path },
      projectRoot,
      now: new Date(),
      runGh: () => '',
      stdout: stream,
      detectRepo: () => 'foo/bar',
    });
    const round: ProposalFile = JSON.parse(readFileSync(path, 'utf8'));
    expect(round.items[0]?.applied).toBe(true);
    expect(round.items[0]?.result).toContain('labeled');
  });
});
