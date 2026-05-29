import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  parseCompleteParentClosureArgs,
  runCompleteParentClosure,
} from '../subcommands/complete-parent-closure.js';
import type { ProposalFile } from '../lifecycle-integration/parent-closure/types.js';

describe('parseCompleteParentClosureArgs', () => {
  it('parses propose with --slug', () => {
    const opts = parseCompleteParentClosureArgs(['propose', '--slug', 'hygiene']);
    expect(opts.verb).toBe('propose');
    if (opts.verb !== 'propose') throw new Error('expected propose');
    expect(opts.slug).toBe('hygiene');
  });
  it('parses propose with --target-version, --repo, --output, --force', () => {
    const opts = parseCompleteParentClosureArgs([
      'propose',
      '--slug',
      'hygiene',
      '--target-version',
      '1.0',
      '--repo',
      'o/r',
      '--output',
      '/tmp/p.json',
      '--force',
    ]);
    expect(opts.verb).toBe('propose');
    if (opts.verb !== 'propose') throw new Error('expected propose');
    expect(opts.targetVersion).toBe('1.0');
    expect(opts.repo).toBe('o/r');
    expect(opts.outputPath).toBe('/tmp/p.json');
    expect(opts.force).toBe(true);
  });
  it('parses apply with --from-file and --repo', () => {
    const opts = parseCompleteParentClosureArgs([
      'apply',
      '--from-file',
      '/tmp/p.json',
      '--repo',
      'o/r',
    ]);
    expect(opts.verb).toBe('apply');
    if (opts.verb !== 'apply') throw new Error('expected apply');
    expect(opts.fromFile).toBe('/tmp/p.json');
    expect(opts.repo).toBe('o/r');
  });
  it('throws on missing verb', () => {
    expect(() => parseCompleteParentClosureArgs([])).toThrow(/Usage:/);
  });
  it('throws on unknown verb', () => {
    expect(() => parseCompleteParentClosureArgs(['banana'])).toThrow(/Unknown verb/);
  });
  it('throws when propose lacks --slug', () => {
    expect(() => parseCompleteParentClosureArgs(['propose'])).toThrow(
      /--slug is required/,
    );
  });
  it('throws when apply lacks --from-file', () => {
    expect(() => parseCompleteParentClosureArgs(['apply'])).toThrow(
      /--from-file is required/,
    );
  });
  it('throws on unknown flag for propose', () => {
    expect(() =>
      parseCompleteParentClosureArgs(['propose', '--slug', 'x', '--banana']),
    ).toThrow(/Unknown flag for propose/);
  });
  it('throws on unknown flag for apply', () => {
    expect(() =>
      parseCompleteParentClosureArgs(['apply', '--from-file', 'x', '--banana']),
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

function setupProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-parent-closure-sub-'));
  // Seed the dw-lifecycle config so loadConfig succeeds.
  mkdirSync(join(root, '.dw-lifecycle'), { recursive: true });
  writeFileSync(
    join(root, '.dw-lifecycle', 'config.json'),
    JSON.stringify({ version: 1 }),
    'utf8',
  );
  return root;
}

function seedFeature(
  root: string,
  slug: string,
  parentIssue: string,
  targetVersion: string = '1.0',
): { featureDir: string } {
  const featureDir = join(root, 'docs', targetVersion, '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(
    join(featureDir, 'README.md'),
    [
      '---',
      `slug: ${slug}`,
      `targetVersion: "${targetVersion}"`,
      `parentIssue: "${parentIssue}"`,
      '---',
      '',
      `# Feature: ${slug}`,
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(featureDir, 'workplan.md'),
    [
      `# Workplan: ${slug}`,
      '',
      '## Phase 0: setup  ·  [#324](https://github.com/o/r/issues/324)',
      '',
      '## Phase 1: baseline  ·  [#325](https://github.com/o/r/issues/325)',
    ].join('\n'),
    'utf8',
  );
  return { featureDir };
}

describe('runCompleteParentClosure -- propose', () => {
  let root: string;
  beforeEach(() => {
    root = setupProjectRoot();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('exit 0 + writes proposal + emits markdown table', () => {
    seedFeature(root, 'hygiene', '#323');
    const outputPath = join(root, 'p.json');
    const runGh = (args: readonly string[]): string => {
      if (args[0] === 'issue' && args[1] === 'list') return '[]';
      if (args[0] === 'api') return '[]';
      if (args[0] === 'issue' && args[1] === 'view') {
        const n = Number.parseInt(args[2] ?? '0', 10);
        return JSON.stringify({
          number: n,
          title: n === 323 ? 'feat(hygiene): parent' : `feat(hygiene): phase ${n}`,
          state: n === 323 ? 'OPEN' : 'CLOSED',
          url: `u${n}`,
        });
      }
      return '';
    };
    const runGit = (args: readonly string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'deadbeef\n';
      return '';
    };
    const { stream, collected } = captureStdout();
    const code = runCompleteParentClosure({
      opts: {
        verb: 'propose',
        slug: 'hygiene',
        repo: 'o/r',
        outputPath,
      },
      projectRoot: root,
      now: new Date('2026-05-28T12:00:00.000Z'),
      runGh,
      runGit,
      stdout: stream,
      stderr: process.stderr,
      detectRepo: () => 'o/r',
    });
    expect(code).toBe(0);
    const out = collected();
    expect(out).toContain('Wrote proposal:');
    expect(out).toContain('Parent issue: #323');
    expect(out).toContain('Feature-complete SHA: deadbeef');
    expect(out).toContain('#323');
  });

  it('exit 2 when README is missing', () => {
    const stderrChunks: string[] = [];
    const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
    stderr.write = ((c: unknown): boolean => {
      stderrChunks.push(typeof c === 'string' ? c : String(c));
      return true;
    }) as NodeJS.WriteStream['write'];
    const { stream } = captureStdout();
    const code = runCompleteParentClosure({
      opts: {
        verb: 'propose',
        slug: 'does-not-exist',
        repo: 'o/r',
        outputPath: join(root, 'p.json'),
      },
      projectRoot: root,
      now: new Date(),
      runGh: () => '[]',
      runGit: () => 'deadbeef\n',
      stdout: stream,
      stderr,
      detectRepo: () => 'o/r',
    });
    expect(code).toBe(2);
    expect(stderrChunks.join('')).toMatch(/file not found/);
  });

  it('exit 2 when output exists and --force is not set', () => {
    seedFeature(root, 'hygiene', '#323');
    const outputPath = join(root, 'p.json');
    writeFileSync(outputPath, '{}', 'utf8');
    const stderrChunks: string[] = [];
    const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
    stderr.write = ((c: unknown): boolean => {
      stderrChunks.push(typeof c === 'string' ? c : String(c));
      return true;
    }) as NodeJS.WriteStream['write'];
    const { stream } = captureStdout();
    const code = runCompleteParentClosure({
      opts: {
        verb: 'propose',
        slug: 'hygiene',
        repo: 'o/r',
        outputPath,
      },
      projectRoot: root,
      now: new Date(),
      runGh: (args) => {
        if (args[0] === 'issue' && args[1] === 'list') return '[]';
        if (args[0] === 'api') return '[]';
        return JSON.stringify({ number: 323, title: 'feat(hygiene)', state: 'OPEN', url: 'u' });
      },
      runGit: () => 'deadbeef\n',
      stdout: stream,
      stderr,
      detectRepo: () => 'o/r',
    });
    expect(code).toBe(2);
    expect(stderrChunks.join('')).toMatch(/already exists/);
  });
});

describe('runCompleteParentClosure -- apply', () => {
  let root: string;
  beforeEach(() => {
    root = setupProjectRoot();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('exit 0 + writes summary line for successful apply', () => {
    const proposalPath = join(root, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      feature_slug: 'hygiene',
      parent_issue: 323,
      feature_complete_sha: 'sha',
      repo: 'o/r',
      approval: 'y',
      items: [
        {
          number: 323,
          title: 'parent',
          url: 'u',
          state: 'OPEN',
          child_issues: [{ number: 324, state: 'CLOSED', title: 't' }],
          classification: 'close-all-children-closed',
          disposition: 'close-all-children-closed',
          closure_comment: 'Closing as feature-complete.',
          applied: null,
          apply_error: null,
          result: null,
        },
      ],
    };
    writeFileSync(proposalPath, JSON.stringify(file, null, 2));
    const { stream, collected } = captureStdout();
    const code = runCompleteParentClosure({
      opts: { verb: 'apply', fromFile: proposalPath },
      projectRoot: root,
      now: new Date(),
      runGh: () => '',
      runGit: () => '',
      stdout: stream,
      stderr: process.stderr,
      detectRepo: () => 'o/r',
    });
    expect(code).toBe(0);
    expect(collected()).toMatch(/Applied: 1; Failed: 0/);
    expect(collected()).toMatch(/closed parent #323/);
  });

  it('exit 0 + Aborted on approval=n', () => {
    const proposalPath = join(root, 'p.json');
    writeFileSync(
      proposalPath,
      JSON.stringify({
        generated_at: '2026-05-28T00:00:00.000Z',
        feature_slug: 'hygiene',
        parent_issue: 323,
        feature_complete_sha: 'sha',
        repo: 'o/r',
        approval: 'n',
        items: [],
      }),
    );
    const { stream, collected } = captureStdout();
    const code = runCompleteParentClosure({
      opts: { verb: 'apply', fromFile: proposalPath },
      projectRoot: root,
      now: new Date(),
      runGh: () => '',
      runGit: () => '',
      stdout: stream,
      stderr: process.stderr,
      detectRepo: () => 'o/r',
    });
    expect(code).toBe(0);
    expect(collected()).toMatch(/Aborted/);
  });

  it('exit 2 on structurally invalid proposal file', () => {
    const proposalPath = join(root, 'p.json');
    writeFileSync(proposalPath, '{ not json');
    const stderrChunks: string[] = [];
    const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
    stderr.write = ((c: unknown): boolean => {
      stderrChunks.push(typeof c === 'string' ? c : String(c));
      return true;
    }) as NodeJS.WriteStream['write'];
    const { stream } = captureStdout();
    const code = runCompleteParentClosure({
      opts: { verb: 'apply', fromFile: proposalPath },
      projectRoot: root,
      now: new Date(),
      runGh: () => '',
      runGit: () => '',
      stdout: stream,
      stderr,
      detectRepo: () => 'o/r',
    });
    expect(code).toBe(2);
    expect(stderrChunks.join('')).toMatch(/Could not parse/);
  });

  it('exit 1 when every approved close-* item fails', () => {
    const proposalPath = join(root, 'p.json');
    const file: ProposalFile = {
      generated_at: '2026-05-28T00:00:00.000Z',
      feature_slug: 'hygiene',
      parent_issue: 323,
      feature_complete_sha: 'sha',
      repo: 'o/r',
      approval: 'y',
      items: [
        {
          number: 323,
          title: 'parent',
          url: 'u',
          state: 'OPEN',
          child_issues: [],
          classification: 'close-all-children-closed',
          disposition: 'close-all-children-closed',
          closure_comment: 'c',
          applied: null,
          apply_error: null,
          result: null,
        },
      ],
    };
    writeFileSync(proposalPath, JSON.stringify(file, null, 2));
    const { stream } = captureStdout();
    const code = runCompleteParentClosure({
      opts: { verb: 'apply', fromFile: proposalPath },
      projectRoot: root,
      now: new Date(),
      runGh: () => {
        throw new Error('gh: every call fails');
      },
      runGit: () => '',
      stdout: stream,
      stderr: process.stderr,
      detectRepo: () => 'o/r',
    });
    expect(code).toBe(1);
  });
});
