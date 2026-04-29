/**
 * End-to-end integration tests for the `deskwork shortform-start` CLI
 * subcommand. Spawns the real binary against a tmp-directory project
 * bootstrapped via deskwork-install. Verifies file scaffolding, workflow
 * idempotence, error shapes, and flag handling.
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

function run(script: string, args: string[]): RunResult {
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
  const project = mkdtempSync(join(tmpdir(), 'deskwork-shortform-start-'));
  const cfgDir = mkdtempSync(join(tmpdir(), 'deskwork-shortform-start-cfg-'));
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
  const res = run('deskwork-install', [project, cfgFile]);
  if (res.code !== 0) {
    rmSync(project, { recursive: true, force: true });
    rmSync(cfgDir, { recursive: true, force: true });
    throw new Error(`install failed: ${res.stderr}`);
  }
  rmSync(cfgDir, { recursive: true, force: true });
  return project;
}

/** Seed a Published longform entry the operator can shortform off. */
function seedPublishedEntry(project: string, slug: string, title: string): void {
  run('deskwork-add', [project, title]);
  run('deskwork-plan', [project, slug, 'kw']);
  run('deskwork-outline', [project, slug]);
  run('deskwork-draft', [project, slug]);
  run('deskwork-publish', [project, slug]);
}

interface ShortformStartJson {
  workflowId: string;
  site: string;
  slug: string;
  state: string;
  version: number;
  fresh: boolean;
  platform: string;
  channel?: string;
  filePath: string;
  reviewUrl: string;
}

describe('deskwork shortform-start', () => {
  let project: string;

  beforeEach(() => {
    project = bootstrap();
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('creates the shortform file and a fresh workflow on first run', () => {
    seedPublishedEntry(project, 'fresh-shortform', 'Fresh Shortform');

    const res = run('deskwork-shortform-start', [
      project,
      '--platform',
      'linkedin',
      'fresh-shortform',
    ]);

    expect(res.code).toBe(0);
    const json = res.json as ShortformStartJson;
    expect(json.workflowId).toMatch(/./);
    expect(json.platform).toBe('linkedin');
    expect(json.fresh).toBe(true);
    expect(json.state).toBe('open');
    expect(json.reviewUrl).toBe(`/dev/editorial-review/${json.workflowId}`);
    expect(json.filePath.endsWith('/scrapbook/shortform/linkedin.md')).toBe(true);
    expect(existsSync(json.filePath)).toBe(true);
  });

  it('is idempotent — resuming returns the same workflow with fresh=false', () => {
    seedPublishedEntry(project, 'idempotent-shortform', 'Idempotent Shortform');

    const first = run('deskwork-shortform-start', [
      project,
      '--platform',
      'linkedin',
      'idempotent-shortform',
    ]);
    expect(first.code).toBe(0);
    const firstJson = first.json as ShortformStartJson;

    const second = run('deskwork-shortform-start', [
      project,
      '--platform',
      'linkedin',
      'idempotent-shortform',
    ]);
    expect(second.code).toBe(0);
    const secondJson = second.json as ShortformStartJson;

    expect(secondJson.workflowId).toBe(firstJson.workflowId);
    expect(secondJson.fresh).toBe(false);
    expect(secondJson.filePath).toBe(firstJson.filePath);
  });

  it('refuses when the slug is not in the calendar', () => {
    const res = run('deskwork-shortform-start', [
      project,
      '--platform',
      'linkedin',
      'no-such-slug',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/no calendar entry/i);
  });

  it('refuses an invalid platform', () => {
    seedPublishedEntry(project, 'bad-platform-target', 'Bad Platform Target');

    const res = run('deskwork-shortform-start', [
      project,
      '--platform',
      'mastodon',
      'bad-platform-target',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid --platform/);
    expect(res.stderr).toMatch(/reddit/);
    expect(res.stderr).toMatch(/linkedin/);
  });

  it('writes --initial-markdown into the file body', () => {
    seedPublishedEntry(project, 'seeded-shortform', 'Seeded Shortform');

    const seed = 'First-pass LinkedIn body — agent-drafted from the published longform.';
    const res = run('deskwork-shortform-start', [
      project,
      '--platform',
      'linkedin',
      '--initial-markdown',
      seed,
      'seeded-shortform',
    ]);
    expect(res.code).toBe(0);
    const json = res.json as ShortformStartJson;
    const fileContent = readFileSync(json.filePath, 'utf-8');
    expect(fileContent).toContain(seed);
    expect(fileContent).toContain('platform: linkedin');
  });

  it('encodes --channel into the filename when supplied', () => {
    seedPublishedEntry(project, 'channelled-shortform', 'Channelled Shortform');

    const res = run('deskwork-shortform-start', [
      project,
      '--platform',
      'reddit',
      '--channel',
      'rprogramming',
      'channelled-shortform',
    ]);
    expect(res.code).toBe(0);
    const json = res.json as ShortformStartJson;
    expect(json.channel).toBe('rprogramming');
    expect(json.filePath.endsWith('/scrapbook/shortform/reddit-rprogramming.md')).toBe(
      true,
    );
    expect(existsSync(json.filePath)).toBe(true);
  });

  it('refuses a channel that violates kebab-case', () => {
    seedPublishedEntry(project, 'bad-channel-target', 'Bad Channel Target');

    const res = run('deskwork-shortform-start', [
      project,
      '--platform',
      'reddit',
      '--channel',
      'r/programming',
      'bad-channel-target',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/channel/i);
  });

  it('refuses when --platform is missing', () => {
    seedPublishedEntry(project, 'no-platform', 'No Platform');

    const res = run('deskwork-shortform-start', [project, 'no-platform']);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--platform is required/);
  });
});
