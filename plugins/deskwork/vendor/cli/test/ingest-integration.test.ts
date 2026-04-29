/**
 * End-to-end integration tests for `deskwork ingest`.
 *
 * Each test spawns the real CLI binary against a tmp project bootstrapped
 * via `deskwork install`. Layout matrix: Astro `<slug>/index.md`, Hugo
 * leaf bundles, Jekyll `YYYY-MM-DD-<slug>.md`, and flat `<slug>.md`.
 *
 * Tests assert:
 *   - dry-run prints a plan and writes nothing
 *   - --apply commits rows + journal entries (idempotent on re-run)
 *   - layout-agnostic discovery works across all four shapes
 *   - state ambiguity is reported, not papered over
 *   - --force overrides the duplicate skip
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
  readdirSync,
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

function run(subcommand: string, args: string[]): RunResult {
  const r = spawnSync(deskworkBin, [subcommand, ...args], { encoding: 'utf-8' });
  const stdout = r.stdout ?? '';
  let json: unknown;
  try {
    json = stdout.trim().length > 0 ? JSON.parse(stdout) : undefined;
  } catch {
    // Text mode plan output isn't JSON; tests that care assert via stdout.
  }
  return {
    code: r.status ?? -1,
    stdout,
    stderr: r.stderr ?? '',
    ...(json !== undefined ? { json } : {}),
  };
}

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'deskwork-ingest-int-'));
  // Minimal config — ingest doesn't need blogLayout / author to write
  // calendar rows, since the existing files already exist on disk.
  const cfg = {
    version: 1,
    sites: {
      main: {
        host: 'example.com',
        contentDir: 'src/content',
        calendarPath: 'docs/calendar.md',
      },
    },
  };
  const cfgFile = join(project, 'config.tmp.json');
  writeFileSync(cfgFile, JSON.stringify(cfg), 'utf-8');
  const installRes = run('install', [project, cfgFile]);
  if (installRes.code !== 0) {
    throw new Error(`install failed: ${installRes.stderr || installRes.stdout}`);
  }
  rmSync(cfgFile);
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function write(rel: string, contents: string): string {
  const abs = join(project, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents, 'utf-8');
  return abs;
}

function readCalendarFile(): ReturnType<typeof parseCalendar> {
  const raw = readFileSync(join(project, 'docs/calendar.md'), 'utf-8');
  return parseCalendar(raw);
}

function journalDir(): string {
  return join(project, '.deskwork/review-journal/ingest');
}

describe('deskwork ingest — dry-run defaults', () => {
  it('prints a plan and writes nothing without --apply', () => {
    write(
      'src/content/posts/hello.md',
      '---\ntitle: Hello\nstate: published\ndatePublished: 2024-01-15\n---\n\nbody',
    );

    const res = run('ingest', [project, 'src/content/posts/hello.md']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Plan: 1 add, 0 skip/);
    expect(res.stdout).toMatch(/dry-run/);
    expect(res.stdout).toMatch(/add\s+hello\s+Published/);

    // Calendar still empty.
    const cal = readCalendarFile();
    expect(cal.entries).toHaveLength(0);
    expect(existsSync(journalDir())).toBe(false);
  });

  it('exits 0 even when every file would be skipped', () => {
    // duplicate against an existing entry
    write(
      'src/content/posts/dup.md',
      '---\ntitle: Dup\nstate: published\ndatePublished: 2024-01-15\n---\n',
    );
    run('ingest', [project, '--apply', 'src/content/posts/dup.md']);
    const res = run('ingest', [project, 'src/content/posts/dup.md']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Plan: 0 add, 1 skip/);
    expect(res.stdout).toMatch(/already has an entry/);
  });

  it('emits JSON plan with --json', () => {
    write(
      'src/content/posts/world.md',
      '---\ntitle: World\nstate: drafting\n---\n',
    );
    const res = run('ingest', [project, '--json', 'src/content/posts/world.md']);
    expect(res.code).toBe(0);
    expect(res.json).toMatchObject({
      apply: false,
      site: 'main',
      add: [
        {
          action: 'add',
          slug: 'world',
          title: 'World',
          stage: 'Drafting',
          sources: { slug: 'path', state: 'frontmatter' },
        },
      ],
      skip: [],
    });
  });
});

describe('deskwork ingest — --apply commits rows + journal', () => {
  it('writes calendar rows and per-file journal entries', () => {
    write(
      'src/content/posts/one/index.md',
      '---\ntitle: One\nstate: published\ndatePublished: 2024-01-01\n---\nbody',
    );
    write(
      'src/content/posts/two/index.md',
      '---\ntitle: Two\nstate: drafting\n---\nbody',
    );

    const res = run('ingest', [project, '--apply', 'src/content/posts']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Applying: 2 add, 0 skip/);

    const cal = readCalendarFile();
    expect(cal.entries).toHaveLength(2);
    const one = cal.entries.find((e) => e.slug === 'one');
    expect(one).toMatchObject({
      slug: 'one',
      title: 'One',
      stage: 'Published',
      datePublished: '2024-01-01',
    });
    const two = cal.entries.find((e) => e.slug === 'two');
    expect(two).toMatchObject({ slug: 'two', stage: 'Drafting' });

    // Journal: one record per ingested row.
    const records = readdirSync(journalDir()).filter((f) => f.endsWith('.json'));
    expect(records).toHaveLength(2);
    const journaled = records.map((f) =>
      JSON.parse(readFileSync(join(journalDir(), f), 'utf-8')),
    );
    expect(journaled.every((r) => r.event === 'ingest')).toBe(true);
    expect(journaled.map((r) => r.slug).sort()).toEqual(['one', 'two']);
    expect(journaled[0].frontmatterSnapshot).toBeDefined();
  });

  it('is idempotent — re-running produces only skips', () => {
    write(
      'src/content/posts/x/index.md',
      '---\ntitle: X\nstate: published\ndatePublished: 2024-01-01\n---\n',
    );
    const first = run('ingest', [project, '--apply', 'src/content/posts']);
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(/Applying: 1 add, 0 skip/);

    const second = run('ingest', [project, '--apply', 'src/content/posts']);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/Applying: 0 add, 1 skip/);
    expect(second.stdout).toMatch(/already has an entry/);

    const cal = readCalendarFile();
    expect(cal.entries).toHaveLength(1);
  });
});

describe('deskwork ingest — layout matrix', () => {
  it('Astro: <slug>/index.md', () => {
    write(
      'src/content/essays/whats-in-a-name/index.md',
      '---\ntitle: Whats In A Name\nstate: published\ndatePublished: 2020-10-01\n---\n',
    );
    write(
      'src/content/essays/the-deskwork-experiment/index.md',
      '---\ntitle: The Deskwork Experiment\nstate: published\ndatePublished: 2026-04-20\n---\n',
    );
    write(
      'src/content/essays/on-revising-in-the-open/index.md',
      '---\ntitle: On Revising In The Open\nstate: draft\ndatePublished: 2026-05-15\n---\n',
    );

    const res = run('ingest', [
      project,
      '--apply',
      'src/content/essays',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries.map((e) => e.slug).sort()).toEqual([
      'on-revising-in-the-open',
      'the-deskwork-experiment',
      'whats-in-a-name',
    ]);
    const whats = cal.entries.find((e) => e.slug === 'whats-in-a-name')!;
    expect(whats.stage).toBe('Published');
    expect(whats.datePublished).toBe('2020-10-01');
    const revising = cal.entries.find((e) => e.slug === 'on-revising-in-the-open')!;
    expect(revising.stage).toBe('Drafting');
  });

  it('Hugo: leaf bundles under content/posts/', () => {
    write(
      'src/content/posts/first/index.md',
      '---\ntitle: First\nstate: published\ndatePublished: 2023-02-02\n---\n',
    );
    write(
      'src/content/posts/second/index.md',
      '---\ntitle: Second\nstate: published\ndatePublished: 2023-03-03\n---\n',
    );

    const res = run('ingest', [project, '--apply', 'src/content/posts']);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries.map((e) => e.slug).sort()).toEqual(['first', 'second']);
  });

  it('Jekyll: _posts/YYYY-MM-DD-slug.md', () => {
    write(
      '_posts/2024-01-15-hello-world.md',
      '---\ntitle: Hello World\nstate: published\n---\n',
    );
    write(
      '_posts/2024-02-20-second-post.md',
      '---\ntitle: Second Post\nstate: published\n---\n',
    );

    const res = run('ingest', [project, '--apply', '_posts']);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries.map((e) => e.slug).sort()).toEqual([
      'hello-world',
      'second-post',
    ]);
  });

  it('flat: <slug>.md', () => {
    write(
      'src/content/blog/foo.md',
      '---\ntitle: Foo\nstate: published\ndatePublished: 2022-06-15\n---\n',
    );
    write(
      'src/content/blog/bar.md',
      '---\ntitle: Bar\nstate: drafting\n---\n',
    );

    const res = run('ingest', [project, '--apply', 'src/content/blog']);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries.map((e) => e.slug).sort()).toEqual(['bar', 'foo']);
    expect(cal.entries.find((e) => e.slug === 'foo')!.stage).toBe('Published');
    expect(cal.entries.find((e) => e.slug === 'bar')!.stage).toBe('Drafting');
  });

  it('hierarchical: nested content nodes with own index.md', () => {
    write(
      'src/content/the-outbound/index.md',
      '---\ntitle: The Outbound\nstate: drafting\n---\n',
    );
    write(
      'src/content/the-outbound/characters/index.md',
      '---\ntitle: Characters\nstate: drafting\n---\n',
    );
    write(
      'src/content/the-outbound/characters/strivers/index.md',
      '---\ntitle: Strivers\nstate: drafting\n---\n',
    );

    const res = run('ingest', [
      project,
      '--apply',
      'src/content/the-outbound',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    const slugs = cal.entries.map((e) => e.slug).sort();
    expect(slugs).toEqual([
      'the-outbound',
      'the-outbound/characters',
      'the-outbound/characters/strivers',
    ]);
  });
});

describe('deskwork ingest — state derivation overrides', () => {
  it('reports ambiguous state and refuses to apply that row', () => {
    write(
      'src/content/posts/weird.md',
      '---\ntitle: Weird\nstate: published-elsewhere\n---\n',
    );

    const res = run('ingest', [project, '--apply', 'src/content/posts/weird.md']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Applying: 0 add, 1 skip/);
    expect(res.stdout).toMatch(/state ambiguous/);
    const cal = readCalendarFile();
    expect(cal.entries).toHaveLength(0);
  });

  it('--state override commits an ambiguous-state file', () => {
    write(
      'src/content/posts/weird.md',
      '---\ntitle: Weird\nstate: published-elsewhere\n---\n',
    );
    const res = run('ingest', [
      project,
      '--apply',
      '--state',
      'Published',
      '--date',
      '2020-01-01',
      'src/content/posts/weird.md',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries).toHaveLength(1);
    expect(cal.entries[0].stage).toBe('Published');
    expect(cal.entries[0].datePublished).toBe('2020-01-01');
  });

  it('--state-from datePublished + future date → Drafting', () => {
    write(
      'src/content/posts/future.md',
      '---\ntitle: Future\ndatePublished: 2099-01-01\n---\n',
    );
    const res = run('ingest', [
      project,
      '--apply',
      '--state-from',
      'datePublished',
      'src/content/posts/future.md',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries[0].stage).toBe('Drafting');
  });

  it('--force bypasses duplicate skip', () => {
    write(
      'src/content/posts/foo.md',
      '---\ntitle: Foo\nstate: published\ndatePublished: 2024-01-01\n---\n',
    );
    run('ingest', [project, '--apply', 'src/content/posts/foo.md']);

    const second = run('ingest', [
      project,
      '--apply',
      '--force',
      'src/content/posts/foo.md',
    ]);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/Applying: 1 add, 0 skip/);

    // Two rows now (force is the operator's choice — the apply layer
    // does not deduplicate after force).
    const cal = readCalendarFile();
    expect(cal.entries).toHaveLength(2);
  });
});

describe('deskwork ingest — flag overrides', () => {
  it('--slug-from frontmatter reads the slug field', () => {
    write(
      'src/content/posts/anything.md',
      '---\ntitle: Whatever\nslug: my-real-slug\nstate: drafting\n---\n',
    );
    const res = run('ingest', [
      project,
      '--apply',
      '--slug-from',
      'frontmatter',
      'src/content/posts/anything.md',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries[0].slug).toBe('my-real-slug');
  });

  it('--slug overrides for single-file ingest', () => {
    write(
      'src/content/posts/x.md',
      '---\ntitle: X\nstate: drafting\n---\n',
    );
    const res = run('ingest', [
      project,
      '--apply',
      '--slug',
      'manual-override',
      'src/content/posts/x.md',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries[0].slug).toBe('manual-override');
  });

  it('rejects --slug with multiple matched files', () => {
    write('src/content/posts/a.md', '---\ntitle: A\nstate: drafting\n---\n');
    write('src/content/posts/b.md', '---\ntitle: B\nstate: drafting\n---\n');
    const res = run('ingest', [
      project,
      '--apply',
      '--slug',
      'foo',
      'src/content/posts',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/exactly one matched file/);
  });

  it('--state-field reads a custom frontmatter field', () => {
    write(
      'src/content/posts/p.md',
      '---\ntitle: P\nstatus: draft\n---\n',
    );
    const res = run('ingest', [
      project,
      '--apply',
      '--state-field',
      'status',
      'src/content/posts/p.md',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries[0].stage).toBe('Drafting');
  });

  it('--date-field reads a custom frontmatter field', () => {
    write(
      'src/content/posts/p.md',
      '---\ntitle: P\nstate: published\nshippedOn: 2018-03-03\n---\n',
    );
    const res = run('ingest', [
      project,
      '--apply',
      '--date-field',
      'shippedOn',
      'src/content/posts/p.md',
    ]);
    expect(res.code).toBe(0);

    const cal = readCalendarFile();
    expect(cal.entries[0].datePublished).toBe('2018-03-03');
  });

  it('--site routes to a non-default site', () => {
    // Re-bootstrap with a multi-site config.
    rmSync(project, { recursive: true, force: true });
    project = mkdtempSync(join(tmpdir(), 'deskwork-ingest-int-'));
    const cfg = {
      version: 1,
      sites: {
        main: {
          host: 'main.example.com',
          contentDir: 'src/sites/main/content',
          calendarPath: 'docs/calendar-main.md',
        },
        secondary: {
          host: 'second.example.com',
          contentDir: 'src/sites/secondary/content',
          calendarPath: 'docs/calendar-secondary.md',
        },
      },
      defaultSite: 'main',
    };
    const cfgFile = join(project, 'config.tmp.json');
    writeFileSync(cfgFile, JSON.stringify(cfg), 'utf-8');
    run('install', [project, cfgFile]);
    rmSync(cfgFile);

    write(
      'src/sites/secondary/content/posts/foo.md',
      '---\ntitle: Foo\nstate: published\ndatePublished: 2020-01-01\n---\n',
    );
    const res = run('ingest', [
      project,
      '--apply',
      '--site',
      'secondary',
      'src/sites/secondary/content/posts/foo.md',
    ]);
    expect(res.code).toBe(0);

    const secondCal = parseCalendar(
      readFileSync(join(project, 'docs/calendar-secondary.md'), 'utf-8'),
    );
    expect(secondCal.entries.map((e) => e.slug)).toEqual(['foo']);

    const mainCal = parseCalendar(
      readFileSync(join(project, 'docs/calendar-main.md'), 'utf-8'),
    );
    expect(mainCal.entries).toHaveLength(0);
  });
});

describe('deskwork ingest — error handling', () => {
  it('refuses unknown flags', () => {
    const res = run('ingest', [project, '--bogus', 'value', 'src']);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Unknown flag/);
  });

  it('refuses an invalid --state', () => {
    write('src/content/posts/p.md', '---\ntitle: P\n---\n');
    const res = run('ingest', [
      project,
      '--state',
      'Bogus',
      'src/content/posts/p.md',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--state must be one of/);
  });

  it('refuses an invalid --date', () => {
    write('src/content/posts/p.md', '---\ntitle: P\n---\n');
    const res = run('ingest', [
      project,
      '--date',
      '2024/01/15',
      'src/content/posts/p.md',
    ]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--date must match/);
  });

  it('errors on a nonexistent path', () => {
    const res = run('ingest', [project, 'no-such-dir']);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/does not exist/);
  });
});

describe('deskwork ingest — scrapbook is skipped by default', () => {
  it('files under <contentDir>/scrapbook/ are reported as skipped', () => {
    write(
      'src/content/posts/x.md',
      '---\ntitle: X\nstate: published\ndatePublished: 2020-01-01\n---\n',
    );
    write(
      'src/content/scrapbook/sketches/y.md',
      '---\ntitle: Y\nstate: published\ndatePublished: 2020-01-01\n---\n',
    );

    const res = run('ingest', [project, 'src/content']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Plan: 1 add, 1 skip/);
    expect(res.stdout).toMatch(/scrapbook/);
  });
});
