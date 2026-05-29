import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  parsePromoteDeferralsArgs,
  runPromoteDeferrals,
} from '../subcommands/promote-deferrals.js';

function makeStdout(): {
  stream: NodeJS.WriteStream;
  read: () => string;
} {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c) => chunks.push(Buffer.from(c)));
  return {
    stream: sink as unknown as NodeJS.WriteStream,
    read: () => Buffer.concat(chunks).toString('utf8'),
  };
}

describe('parsePromoteDeferralsArgs', () => {
  it('parses propose with required --workplan', () => {
    const opts = parsePromoteDeferralsArgs(['propose', '--workplan', 'wp.md']);
    expect(opts.verb).toBe('propose');
    if (opts.verb !== 'propose') throw new Error('unreachable');
    expect(opts.workplan).toBe('wp.md');
  });

  it('parses propose with --repo + --output + --force', () => {
    const opts = parsePromoteDeferralsArgs([
      'propose',
      '--workplan',
      'wp.md',
      '--repo',
      'owner/repo',
      '--output',
      '/tmp/x.json',
      '--force',
    ]);
    if (opts.verb !== 'propose') throw new Error('unreachable');
    expect(opts.repo).toBe('owner/repo');
    expect(opts.outputPath).toBe('/tmp/x.json');
    expect(opts.force).toBe(true);
  });

  it('parses apply with required --from-file', () => {
    const opts = parsePromoteDeferralsArgs([
      'apply',
      '--from-file',
      '/tmp/p.json',
    ]);
    expect(opts.verb).toBe('apply');
    if (opts.verb !== 'apply') throw new Error('unreachable');
    expect(opts.fromFile).toBe('/tmp/p.json');
  });

  it('rejects unknown verbs', () => {
    expect(() => parsePromoteDeferralsArgs(['frobnicate'])).toThrow(/Unknown verb/);
  });

  it('rejects propose with no --workplan', () => {
    expect(() => parsePromoteDeferralsArgs(['propose'])).toThrow(
      /--workplan is required/,
    );
  });

  it('rejects apply with no --from-file', () => {
    expect(() => parsePromoteDeferralsArgs(['apply'])).toThrow(
      /--from-file is required/,
    );
  });

  it('rejects unknown flags', () => {
    expect(() =>
      parsePromoteDeferralsArgs(['propose', '--workplan', 'x', '--bogus']),
    ).toThrow(/Unknown flag/);
  });
});

describe('runPromoteDeferrals — propose verb', () => {
  let projectRoot: string;
  let workplanPath: string;
  const now = new Date('2026-05-28T18:30:00.000Z');

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'sub-propose-'));
    workplanPath = join(projectRoot, 'workplan.md');
    writeFileSync(
      workplanPath,
      `# Plan
## Phase 1: Setup
- [ ] TBD: thing
`,
      'utf8',
    );
  });

  it('writes the proposal file and prints the table', () => {
    const { stream, read } = makeStdout();
    const code = runPromoteDeferrals({
      opts: {
        verb: 'propose',
        workplan: workplanPath,
        repo: 'owner/repo',
      },
      projectRoot,
      now,
      runGh: () => '',
      stdout: stream,
      detectRepo: () => 'owner/repo',
    });
    expect(code).toBe(0);
    const out = read();
    expect(out).toMatch(/Wrote proposal:/);
    expect(out).toMatch(/Items: 1/);
    expect(out).toMatch(/FILL IN/);
  });

  it('resolves a relative --workplan against projectRoot', () => {
    const { stream, read } = makeStdout();
    const code = runPromoteDeferrals({
      opts: {
        verb: 'propose',
        workplan: 'workplan.md',
        repo: 'owner/repo',
      },
      projectRoot,
      now,
      runGh: () => '',
      stdout: stream,
      detectRepo: () => 'owner/repo',
    });
    expect(code).toBe(0);
    expect(read()).toMatch(/Items: 1/);
  });

  it('returns exit code 2 when output file already exists without --force', () => {
    const { stream } = makeStdout();
    const output = join(projectRoot, 'proposal.json');
    writeFileSync(output, '{}', 'utf8');
    const code = runPromoteDeferrals({
      opts: {
        verb: 'propose',
        workplan: workplanPath,
        repo: 'owner/repo',
        outputPath: output,
      },
      projectRoot,
      now,
      runGh: () => '',
      stdout: stream,
      detectRepo: () => 'owner/repo',
    });
    expect(code).toBe(2);
  });

  it('falls back to detectRepo when --repo is omitted', () => {
    const { stream, read } = makeStdout();
    let detectCalled = 0;
    runPromoteDeferrals({
      opts: { verb: 'propose', workplan: workplanPath },
      projectRoot,
      now,
      runGh: () => '',
      stdout: stream,
      detectRepo: () => {
        detectCalled += 1;
        return 'detected/repo';
      },
    });
    expect(detectCalled).toBe(1);
    expect(read()).toMatch(/Repo: detected\/repo/);
  });
});

describe('runPromoteDeferrals — apply verb', () => {
  let projectRoot: string;
  let workplanPath: string;
  let proposalPath: string;
  const now = new Date('2026-05-28T18:30:00.000Z');

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'sub-apply-'));
    workplanPath = join(projectRoot, 'workplan.md');
    writeFileSync(
      workplanPath,
      `# Plan
## Phase 1: Setup
- [ ] TBD: figure out schema
`,
      'utf8',
    );
    proposalPath = join(projectRoot, 'proposal.json');
  });

  it('returns 0 and prints summary when applied successfully', () => {
    writeFileSync(
      proposalPath,
      JSON.stringify({
        generated_at: now.toISOString(),
        workplan_path: workplanPath,
        repo: 'owner/repo',
        approval: 'y',
        items: [
          {
            lineNumber: 3,
            markerKey: 'tbd',
            text: '- [ ] TBD: figure out schema',
            containingTask: null,
            parentPhase: 'Phase 1: Setup',
            containingTaskLine: null,
            parentPhaseLine: 2,
            disposition: 'inline-wontfix',
            disposition_fields: {
              reason:
                'the schema design was absorbed into the v0.18 migration; the surface no longer exists',
            },
            applied: null,
            apply_error: null,
            result: null,
          },
        ],
      }),
      'utf8',
    );
    const { stream, read } = makeStdout();
    const code = runPromoteDeferrals({
      opts: { verb: 'apply', fromFile: proposalPath },
      projectRoot,
      now,
      runGh: () => '',
      stdout: stream,
      detectRepo: () => 'owner/repo',
    });
    expect(code).toBe(0);
    expect(read()).toMatch(/Applied: 1; Failed: 0; Skipped: 0/);
    // Workplan rewritten
    expect(readFileSync(workplanPath, 'utf8')).toMatch(/\(wontfix:/);
  });

  it('returns 2 when proposal file is malformed', () => {
    writeFileSync(proposalPath, '{not json', 'utf8');
    const { stream } = makeStdout();
    const code = runPromoteDeferrals({
      opts: { verb: 'apply', fromFile: proposalPath },
      projectRoot,
      now,
      runGh: () => '',
      stdout: stream,
      detectRepo: () => 'owner/repo',
    });
    expect(code).toBe(2);
  });

  it('returns 1 when every approved row failed', () => {
    writeFileSync(
      proposalPath,
      JSON.stringify({
        generated_at: now.toISOString(),
        workplan_path: workplanPath,
        repo: 'owner/repo',
        approval: 'y',
        items: [
          {
            lineNumber: 3,
            markerKey: 'tbd',
            text: '- [ ] TBD: figure out schema',
            containingTask: null,
            parentPhase: 'Phase 1: Setup',
            containingTaskLine: null,
            parentPhaseLine: 2,
            disposition: 'promote-to-issue',
            disposition_fields: {
              title: 'X',
              body: 'This is a valid body that exceeds the forty-character minimum requirement',
            },
            applied: null,
            apply_error: null,
            result: null,
          },
        ],
      }),
      'utf8',
    );
    const { stream, read } = makeStdout();
    const code = runPromoteDeferrals({
      opts: { verb: 'apply', fromFile: proposalPath },
      projectRoot,
      now,
      runGh: () => {
        throw new Error('gh failed: auth missing');
      },
      stdout: stream,
      detectRepo: () => 'owner/repo',
    });
    expect(code).toBe(1);
    expect(read()).toMatch(/Failed line 3:/);
  });
});
