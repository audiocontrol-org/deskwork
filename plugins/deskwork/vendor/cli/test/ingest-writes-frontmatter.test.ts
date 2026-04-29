/**
 * Integration tests for `deskwork ingest --apply` writing the
 * `deskwork.id` binding into source-file frontmatter (Issue #63).
 *
 * Before the fix, ingest minted a UUID for the calendar entry but
 * never persisted it back into the file it was binding. The calendar
 * entry was orphaned at creation; doctor immediately flagged
 * `missing-frontmatter-id`.
 *
 * The fix: after appending the calendar row, ingest patches the
 * source file's frontmatter to include `deskwork.id: <uuid>` (round-
 * trip-preserving via `updateFrontmatter`). A `--no-write-frontmatter`
 * flag opts out for read-only / export trees.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '@deskwork/core/frontmatter';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(subcommand: string, args: string[]): RunResult {
  const r = spawnSync(deskworkBin, [subcommand, ...args], { encoding: 'utf-8' });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'deskwork-ingest-fm-'));
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
  const res = run('install', [project, cfgFile]);
  if (res.code !== 0) {
    throw new Error(`install failed: ${res.stderr || res.stdout}`);
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('deskwork ingest --apply writes deskwork.id frontmatter (Issue #63)', () => {
  it('on a file with existing frontmatter, merges in deskwork.id without disturbing other fields', () => {
    const file = write(
      'src/content/posts/hello.md',
      '---\ntitle: Hello\nstate: published\ndatePublished: 2024-01-15\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', file]);
    expect(res.code).toBe(0);

    const contents = readFileSync(file, 'utf-8');
    const parsed = parseFrontmatter(contents);

    // Pre-existing fields are preserved.
    expect(parsed.data.title).toBe('Hello');
    expect(parsed.data.state).toBe('published');

    // The deskwork namespace now contains a UUID-shaped id.
    const block = parsed.data.deskwork;
    expect(block).toBeDefined();
    expect(typeof block).toBe('object');
    expect(Array.isArray(block)).toBe(false);
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      const id = (block as Record<string, unknown>).id;
      expect(typeof id).toBe('string');
      expect(typeof id === 'string' && UUID_RE.test(id)).toBe(true);
    }

    // Body preserved (just `body\n`).
    expect(parsed.body.trim()).toBe('body');
  });

  it('on a file with no frontmatter at all, prepends a fresh frontmatter block carrying deskwork.id', () => {
    const file = write(
      'src/content/posts/raw.md',
      '# Raw Post\n\nNo frontmatter here.\n',
    );

    const res = run('ingest', [
      project,
      '--apply',
      '--state',
      'Drafting',
      '--slug',
      'raw',
      file,
    ]);
    expect(res.code).toBe(0);

    const contents = readFileSync(file, 'utf-8');
    expect(contents.startsWith('---')).toBe(true);

    const parsed = parseFrontmatter(contents);
    const block = parsed.data.deskwork;
    expect(block).toBeDefined();
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      const id = (block as Record<string, unknown>).id;
      expect(typeof id === 'string' && UUID_RE.test(id)).toBe(true);
    }

    // The original body content lives after the new frontmatter block.
    expect(parsed.body).toContain('# Raw Post');
    expect(parsed.body).toContain('No frontmatter here.');
  });

  it('the calendar entry id matches the deskwork.id written into the file', () => {
    const file = write(
      'src/content/posts/match.md',
      '---\ntitle: Match\nstate: drafting\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', file]);
    expect(res.code).toBe(0);

    const fileContents = readFileSync(file, 'utf-8');
    const fileParsed = parseFrontmatter(fileContents);
    const fileBlock = fileParsed.data.deskwork;
    expect(fileBlock).toBeDefined();
    let fileId: string | undefined;
    if (fileBlock && typeof fileBlock === 'object' && !Array.isArray(fileBlock)) {
      const candidate = (fileBlock as Record<string, unknown>).id;
      if (typeof candidate === 'string') fileId = candidate;
    }
    expect(fileId).toBeDefined();

    // Calendar entry should carry the same UUID. Read the calendar
    // markdown — the id appears as a cell value in the table row.
    if (fileId === undefined) {
      throw new Error('expected fileId to be defined');
    }
    const calendarRaw = readFileSync(
      join(project, 'docs/calendar.md'),
      'utf-8',
    );
    expect(calendarRaw).toContain(fileId);
  });

  it('--no-write-frontmatter skips the file write but still appends the calendar row', () => {
    const file = write(
      'src/content/posts/skip-fm.md',
      '---\ntitle: Skip FM\nstate: drafting\n---\n\nbody\n',
    );
    const before = readFileSync(file, 'utf-8');

    const res = run('ingest', [
      project,
      '--apply',
      '--no-write-frontmatter',
      file,
    ]);
    expect(res.code).toBe(0);

    const after = readFileSync(file, 'utf-8');
    expect(after).toBe(before);
    expect(after).not.toContain('deskwork:');

    // Calendar row was still added.
    const calendarRaw = readFileSync(
      join(project, 'docs/calendar.md'),
      'utf-8',
    );
    expect(calendarRaw).toContain('Skip FM');
  });
});
