/**
 * End-to-end integration test for the review-loop helpers. Spawns each
 * real script against a tmp project bootstrapped via deskwork-install,
 * verifies the review flow: start → (operator comment) → (request
 * iteration) → iterate → (operator approve) → approve.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(testDir, '..');
const bin = (name: string) => join(pluginRoot, 'bin', `${name}.ts`);

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}

function run(script: string, args: string[]): RunResult {
  const r = spawnSync(bin(script), args, { encoding: 'utf-8' });
  const stdout = r.stdout ?? '';
  let json: unknown;
  try {
    json = stdout.trim().length > 0 ? JSON.parse(stdout) : undefined;
  } catch {
    // text-mode output is not JSON; leave undefined
  }
  return {
    code: r.status ?? -1,
    stdout,
    stderr: r.stderr ?? '',
    ...(json !== undefined ? { json } : {}),
  };
}

function bootstrap(): string {
  const project = mkdtempSync(join(tmpdir(), 'deskwork-review-e2e-'));
  const cfgDir = mkdtempSync(join(tmpdir(), 'deskwork-review-e2e-cfg-'));
  const cfgFile = join(cfgDir, 'config.json');
  writeFileSync(
    cfgFile,
    JSON.stringify({
      version: 1,
      author: 'Test Author',
      sites: {
        main: {
          host: 'example.com',
          contentDir: 'content/blog',
          calendarPath: 'docs/calendar.md',
          blogFilenameTemplate: '{slug}.md',
          blogInitialState: 'draft',
          blogOutlineSection: true,
        },
      },
    }),
    'utf-8',
  );
  const res = run('deskwork-install', [project, cfgFile]);
  if (res.code !== 0) {
    rmSync(project, { recursive: true, force: true });
    rmSync(cfgDir, { recursive: true, force: true });
    throw new Error(`install failed: ${res.stderr}`);
  }
  rmSync(cfgDir, { recursive: true, force: true });
  return project;
}

describe('review loop', () => {
  let project: string;

  beforeEach(() => {
    project = bootstrap();
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('runs the full loop: start → iterate → approve', () => {
    // Scaffold + draft a blog post so there's something to review.
    run('deskwork-add', [project, 'Reviewable Post']);
    run('deskwork-plan', [project, 'reviewable-post', 'kw']);
    run('deskwork-outline', [project, 'reviewable-post']);
    run('deskwork-draft', [project, 'reviewable-post']);

    // Write real body so body-state is 'written' (iterate needs disk != v1).
    const blogFile = join(project, 'content/blog/reviewable-post.md');
    writeFileSync(
      blogFile,
      readFileSync(blogFile, 'utf-8') + '\n\n## Intro\n\nReal body v1.\n',
      'utf-8',
    );

    // Enqueue review.
    const startRes = run('deskwork-review-start', [project, 'reviewable-post']);
    expect(startRes.code).toBe(0);
    const workflowId = (startRes.json as { workflowId: string }).workflowId;
    expect(workflowId).toMatch(/./);
    expect((startRes.json as { state: string }).state).toBe('open');

    // Idempotent — running again returns the same workflow.
    const startAgain = run('deskwork-review-start', [project, 'reviewable-post']);
    expect((startAgain.json as { workflowId: string }).workflowId).toBe(workflowId);
    expect((startAgain.json as { fresh: boolean }).fresh).toBe(false);

    // Simulate the operator clicking "Start Review" → "Request Iteration" via
    // direct pipeline transitions. In the studio these would be API calls.
    const pipeline = `
      import { transitionState } from '@deskwork/core/review/pipeline';
      import { readConfig } from '@deskwork/core/config';
      const cfg = readConfig('${project}');
      transitionState('${project}', cfg, '${workflowId}', 'in-review');
      transitionState('${project}', cfg, '${workflowId}', 'iterating');
    `;
    const tx = spawnSync('tsx', ['-e', pipeline], { encoding: 'utf-8' });
    if (tx.status !== 0) throw new Error(`transition script failed: ${tx.stderr}`);

    // Agent rewrites disk. Iterate snapshots.
    writeFileSync(
      blogFile,
      readFileSync(blogFile, 'utf-8').replace(
        'Real body v1.',
        'Addressed comments. Real body v2.',
      ),
      'utf-8',
    );

    const iterRes = run('deskwork-iterate', [project, 'reviewable-post']);
    expect(iterRes.code).toBe(0);
    expect(iterRes.json).toMatchObject({
      state: 'in-review',
      version: 2,
    });

    // Operator approves v2 — simulate via pipeline API calls.
    const approveScript = `
      import { transitionState, mintAnnotation, appendAnnotation } from '@deskwork/core/review/pipeline';
      import { readConfig } from '@deskwork/core/config';
      const cfg = readConfig('${project}');
      const ann = mintAnnotation({ type: 'approve', workflowId: '${workflowId}', version: 2 });
      appendAnnotation('${project}', cfg, ann);
      transitionState('${project}', cfg, '${workflowId}', 'approved');
    `;
    const appr = spawnSync('tsx', ['-e', approveScript], { encoding: 'utf-8' });
    if (appr.status !== 0) throw new Error(`approve script failed: ${appr.stderr}`);

    // Final: approve helper transitions to applied.
    const approveRes = run('deskwork-approve', [project, 'reviewable-post']);
    expect(approveRes.code).toBe(0);
    expect(approveRes.json).toMatchObject({
      state: 'applied',
      version: 2,
      contentKind: 'longform',
    });
  });

  it('refuses iterate when disk matches the current version', () => {
    run('deskwork-add', [project, 'Same']);
    run('deskwork-plan', [project, 'same', 'kw']);
    run('deskwork-outline', [project, 'same']);
    run('deskwork-draft', [project, 'same']);
    const blogFile = join(project, 'content/blog/same.md');
    writeFileSync(blogFile, readFileSync(blogFile, 'utf-8') + '\n\nbody\n', 'utf-8');

    const start = run('deskwork-review-start', [project, 'same']);
    const workflowId = (start.json as { workflowId: string }).workflowId;

    // Transition to iterating without changing disk.
    const tx = spawnSync(
      'tsx',
      [
        '-e',
        `
          import { transitionState } from '@deskwork/core/review/pipeline';
          import { readConfig } from '@deskwork/core/config';
          const cfg = readConfig('${project}');
          transitionState('${project}', cfg, '${workflowId}', 'in-review');
          transitionState('${project}', cfg, '${workflowId}', 'iterating');
        `,
      ],
      { encoding: 'utf-8' },
    );
    if (tx.status !== 0) throw new Error(tx.stderr);

    const res = run('deskwork-iterate', [project, 'same']);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/no revision to snapshot/);
  });

  it('review-help lists open workflows; review-cancel removes them', () => {
    run('deskwork-add', [project, 'Cancelled Test']);
    run('deskwork-plan', [project, 'cancelled-test', 'kw']);
    run('deskwork-outline', [project, 'cancelled-test']);
    run('deskwork-draft', [project, 'cancelled-test']);
    mkdirSync(join(project, 'content/blog'), { recursive: true });
    run('deskwork-review-start', [project, 'cancelled-test']);

    const before = run('deskwork-review-help', [project]);
    expect((before.json as { count: number }).count).toBe(1);

    const cancelRes = run('deskwork-review-cancel', [project, 'cancelled-test']);
    expect(cancelRes.code).toBe(0);
    expect(cancelRes.json).toMatchObject({
      state: 'cancelled',
      previousState: 'open',
    });

    const after = run('deskwork-review-help', [project]);
    expect((after.json as { count: number }).count).toBe(0);
  });

  it('review-report returns an empty report on a fresh project', () => {
    const res = run('deskwork-review-report', [project]);
    expect(res.code).toBe(0);
    expect(res.json).toMatchObject({
      all: { approvedCount: 0, cancelledCount: 0, totalComments: 0 },
    });
  });

  it('review-report --format text produces human-readable output', () => {
    const res = run('deskwork-review-report', [project, '--format', 'text']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/voice-drift signal/);
    expect(res.stdout).toMatch(/Total comments: 0/);
  });
});
