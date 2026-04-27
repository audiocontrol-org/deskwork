/**
 * Phase 21a CLI integration: iterate / approve against a shortform
 * workflow. Drives the real `deskwork` binary against a tmp project
 * bootstrapped via deskwork-install.
 *
 * Shortform-start hasn't been ported into the CLI yet (Phase 21b); the
 * test drives `handleStartShortform` programmatically to seed the
 * workflow + file, then exercises iterate / approve via the CLI to
 * verify the kind-agnostic path works end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}

function runCli(script: string, args: string[]): RunResult {
  const subcommand = script.replace(/^deskwork-/, '');
  const r = spawnSync(deskworkBin, [subcommand, ...args], { encoding: 'utf-8' });
  const stdout = r.stdout ?? '';
  let json: unknown;
  try {
    json = stdout.trim().length > 0 ? JSON.parse(stdout) : undefined;
  } catch {
    // text-mode output is not JSON; tests that care will fail on assertion
  }
  return {
    code: r.status ?? -1,
    stdout,
    stderr: r.stderr ?? '',
    ...(json !== undefined ? { json } : {}),
  };
}

function bootstrap(): string {
  const project = mkdtempSync(join(tmpdir(), 'deskwork-shortform-cli-'));
  const cfgDir = mkdtempSync(join(tmpdir(), 'deskwork-shortform-cli-cfg-'));
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
        },
      },
    }),
    'utf-8',
  );
  const res = runCli('deskwork-install', [project, cfgFile]);
  if (res.code !== 0) {
    rmSync(project, { recursive: true, force: true });
    rmSync(cfgDir, { recursive: true, force: true });
    throw new Error(`install failed: ${res.stderr}`);
  }
  rmSync(cfgDir, { recursive: true, force: true });
  return project;
}

/**
 * Spawns a one-off tsx script that uses the @deskwork/core programmatic
 * API. Used to seed shortform workflows + state transitions until 21b
 * ships the `shortform-start` CLI subcommand.
 */
function runScript(script: string): { code: number; stderr: string; stdout: string } {
  const r = spawnSync('tsx', ['-e', script], { encoding: 'utf-8' });
  return {
    code: r.status ?? -1,
    stderr: r.stderr ?? '',
    stdout: r.stdout ?? '',
  };
}

describe('shortform review CLI loop (Phase 21a)', () => {
  let project: string;

  beforeEach(() => {
    project = bootstrap();
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('iterate accepts --kind shortform and approve reads from the file', () => {
    // Build a Published entry the operator can shortform off.
    runCli('deskwork-add', [project, 'Shortform Subject']);
    runCli('deskwork-plan', [project, 'shortform-subject', 'kw']);
    runCli('deskwork-outline', [project, 'shortform-subject']);
    runCli('deskwork-draft', [project, 'shortform-subject']);
    runCli('deskwork-publish', [project, 'shortform-subject']);

    // Seed the shortform workflow + file via the programmatic API.
    const startScript = `
      import { handleStartShortform } from '@deskwork/core/review/handlers';
      import { readConfig } from '@deskwork/core/config';
      const cfg = readConfig('${project}');
      const r = handleStartShortform('${project}', cfg, {
        site: 'main',
        slug: 'shortform-subject',
        platform: 'linkedin',
        initialMarkdown: 'Initial LinkedIn body.',
      });
      if (r.status !== 200) {
        console.error(JSON.stringify(r.body));
        process.exit(1);
      }
      console.log(JSON.stringify(r.body));
    `;
    const startRes = runScript(startScript);
    expect(startRes.code).toBe(0);
    const startBody = JSON.parse(startRes.stdout) as {
      workflow: { id: string };
      filePath: string;
    };
    const workflowId = startBody.workflow.id;
    const filePath = startBody.filePath;
    expect(existsSync(filePath)).toBe(true);

    // Move the workflow to 'iterating' so iterate can run.
    const transitionScript = `
      import { transitionState } from '@deskwork/core/review/pipeline';
      import { readConfig } from '@deskwork/core/config';
      const cfg = readConfig('${project}');
      transitionState('${project}', cfg, '${workflowId}', 'in-review');
      transitionState('${project}', cfg, '${workflowId}', 'iterating');
    `;
    const tx = runScript(transitionScript);
    if (tx.code !== 0) throw new Error(`transition failed: ${tx.stderr}`);

    // Operator (or the agent on their behalf) rewrites the shortform file.
    const before = readFileSync(filePath, 'utf-8');
    const after = before.replace(
      'Initial LinkedIn body.',
      'Polished LinkedIn body — operator pass.',
    );
    expect(after).not.toBe(before);
    writeFileSync(filePath, after, 'utf-8');

    // Iterate accepts --kind shortform and snapshots the new file content.
    const iter = runCli('deskwork-iterate', [
      project,
      '--kind',
      'shortform',
      '--platform',
      'linkedin',
      'shortform-subject',
    ]);
    expect(iter.code).toBe(0);
    expect(iter.json).toMatchObject({
      state: 'in-review',
      version: 2,
    });

    // Approve v2 → record the approve annotation + transition to 'approved'.
    const approveScript = `
      import { transitionState, mintAnnotation, appendAnnotation } from '@deskwork/core/review/pipeline';
      import { readConfig } from '@deskwork/core/config';
      const cfg = readConfig('${project}');
      const ann = mintAnnotation({ type: 'approve', workflowId: '${workflowId}', version: 2 });
      appendAnnotation('${project}', cfg, ann);
      transitionState('${project}', cfg, '${workflowId}', 'approved');
    `;
    const appr = runScript(approveScript);
    if (appr.code !== 0) throw new Error(`approve failed: ${appr.stderr}`);

    // Seed a distribution record so approve has somewhere to write.
    // (The distribute helper lands in 21b — until then, seed the
    // record programmatically.)
    const seedDistScript = `
      import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
      import { resolveCalendarPath } from '@deskwork/core/paths';
      import { readConfig } from '@deskwork/core/config';
      import { addDistribution } from '@deskwork/core/calendar-mutations';
      const cfg = readConfig('${project}');
      const path = resolveCalendarPath('${project}', cfg, 'main');
      const cal = readCalendar(path);
      addDistribution(cal, {
        slug: 'shortform-subject',
        platform: 'linkedin',
        url: '',
        dateShared: '2026-04-27',
      });
      writeCalendar(path, cal);
    `;
    const seed = runScript(seedDistScript);
    if (seed.code !== 0) {
      throw new Error(`seedDist failed: ${seed.stderr}`);
    }

    // approve reads from the file (the SSOT) and writes to the
    // distribution record's `shortform` field.
    const approveCli = runCli('deskwork-approve', [
      project,
      '--platform',
      'linkedin',
      'shortform-subject',
    ]);
    if (approveCli.code !== 0) {
      throw new Error(`approve failed: ${approveCli.stderr}`);
    }
    expect(approveCli.code).toBe(0);
    const approveJson = approveCli.json as {
      state: string;
      version: number;
      contentKind: string;
      filePath: string;
    };
    expect(approveJson.state).toBe('applied');
    expect(approveJson.version).toBe(2);
    expect(approveJson.contentKind).toBe('shortform');
    expect(approveJson.filePath).toBe(filePath);

    // Verify the calendar now carries the file body in the distribution
    // record (not the v1 inline content from the workflow).
    const cal = readFileSync(join(project, 'docs/calendar.md'), 'utf-8');
    expect(cal).toContain('Polished LinkedIn body — operator pass.');
    expect(cal).not.toContain('Initial LinkedIn body.');
  });

  it('iterate rejects --kind shortform without --platform', () => {
    runCli('deskwork-add', [project, 'Reject Test']);
    const r = runCli('deskwork-iterate', [
      project,
      '--kind',
      'shortform',
      'reject-test',
    ]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--platform is required/);
  });
});
