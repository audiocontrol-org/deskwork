/**
 * End-to-end integration tests for the `deskwork distribute` CLI
 * subcommand. Spawns the real binary against a tmp-directory project
 * bootstrapped via deskwork-install. Covers creation of fresh
 * distribution records, updates to existing records, the
 * Published-stage invariant, and platform validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCalendar } from '@deskwork/core/calendar';

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
  const project = mkdtempSync(join(tmpdir(), 'deskwork-distribute-'));
  const cfgDir = mkdtempSync(join(tmpdir(), 'deskwork-distribute-cfg-'));
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

function seedPublishedEntry(project: string, slug: string, title: string): void {
  run('deskwork-add', [project, title]);
  run('deskwork-plan', [project, slug, 'kw']);
  run('deskwork-outline', [project, slug]);
  run('deskwork-draft', [project, slug]);
  run('deskwork-publish', [project, slug]);
}

function readDistributions(project: string) {
  const raw = readFileSync(join(project, 'docs/calendar.md'), 'utf-8');
  return parseCalendar(raw).distributions;
}

describe('deskwork distribute', () => {
  let project: string;

  beforeEach(() => {
    project = bootstrap();
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it('creates a fresh distribution record on a Published entry', () => {
    seedPublishedEntry(project, 'fresh-distribute', 'Fresh Distribute');

    const res = run('deskwork-distribute', [
      project,
      '--platform',
      'linkedin',
      '--url',
      'https://www.linkedin.com/posts/example-12345',
      'fresh-distribute',
    ]);
    expect(res.code).toBe(0);
    const json = res.json as { url: string; platform: string; dateShared: string };
    expect(json.url).toBe('https://www.linkedin.com/posts/example-12345');
    expect(json.platform).toBe('linkedin');
    expect(json.dateShared).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const distributions = readDistributions(project);
    expect(distributions.length).toBe(1);
    expect(distributions[0].url).toBe('https://www.linkedin.com/posts/example-12345');
    expect(distributions[0].platform).toBe('linkedin');
    expect(distributions[0].slug).toBe('fresh-distribute');
  });

  it('updates an existing distribution record (URL backfill)', () => {
    seedPublishedEntry(project, 'update-distribute', 'Update Distribute');

    // Seed a placeholder record (URL empty) — simulates the post-approve,
    // pre-distribute state where the shortform copy is already on the
    // record but the operator hasn't posted to the platform yet.
    const seedScript = `
      import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
      import { resolveCalendarPath } from '@deskwork/core/paths';
      import { readConfig } from '@deskwork/core/config';
      import { addDistribution } from '@deskwork/core/calendar-mutations';
      const cfg = readConfig('${project}');
      const path = resolveCalendarPath('${project}', cfg, 'main');
      const cal = readCalendar(path);
      addDistribution(cal, {
        slug: 'update-distribute',
        platform: 'linkedin',
        url: '',
        dateShared: '2026-04-20',
      });
      writeCalendar(path, cal);
    `;
    const seed = spawnSync('tsx', ['-e', seedScript], { encoding: 'utf-8' });
    if (seed.status !== 0) throw new Error(`seed failed: ${seed.stderr}`);

    const res = run('deskwork-distribute', [
      project,
      '--platform',
      'linkedin',
      '--url',
      'https://www.linkedin.com/posts/posted-now',
      '--date',
      '2026-04-27',
      '--notes',
      'Backfilled after manual post.',
      'update-distribute',
    ]);
    expect(res.code).toBe(0);

    const distributions = readDistributions(project);
    expect(distributions.length).toBe(1);
    expect(distributions[0].url).toBe('https://www.linkedin.com/posts/posted-now');
    expect(distributions[0].dateShared).toBe('2026-04-27');
    expect(distributions[0].notes).toBe('Backfilled after manual post.');
  });

  it('refuses to record distribution for a non-Published entry', () => {
    // Get the slug onto the calendar but don't publish.
    run('deskwork-add', [project, 'Unpublished']);
    run('deskwork-plan', [project, 'unpublished', 'kw']);

    const res = run('deskwork-distribute', [
      project,
      '--platform',
      'linkedin',
      '--url',
      'https://www.linkedin.com/posts/example',
      'unpublished',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/non-Published/);
    expect(res.stderr).toMatch(/\/deskwork:publish/);
  });

  it('refuses an invalid platform', () => {
    seedPublishedEntry(project, 'bad-platform-dist', 'Bad Platform Dist');

    const res = run('deskwork-distribute', [
      project,
      '--platform',
      'mastodon',
      '--url',
      'https://example.com/post',
      'bad-platform-dist',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid --platform/);
  });

  it('refuses when slug is not in the calendar', () => {
    const res = run('deskwork-distribute', [
      project,
      '--platform',
      'linkedin',
      '--url',
      'https://www.linkedin.com/posts/example',
      'no-such-slug',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/No calendar entry/);
  });

  it('refuses when --url is missing', () => {
    seedPublishedEntry(project, 'no-url', 'No URL');
    const res = run('deskwork-distribute', [
      project,
      '--platform',
      'linkedin',
      'no-url',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--url is required/);
  });
});
