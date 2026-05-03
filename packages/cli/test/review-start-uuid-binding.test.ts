/**
 * Integration test: `deskwork review-start` resolves the file via the
 * UUID-bound content index, not the slug-template (Issue #67).
 *
 * The fixture stages a calendar entry and writes its markdown at a
 * NON-slug-template path: instead of `<contentDir>/<slug>/index.md`,
 * the file lives at `<contentDir>/projects/the-outbound/index.md` while
 * the entry's slug is `the-outbound` (so the slug template would point
 * at `<contentDir>/the-outbound/index.md` — a path that does not exist).
 *
 * Pre-fix: review-start's `resolveBlogFilePath(slug)` looked at the
 * non-existent slug-template path and bailed with "no markdown".
 *
 * Post-fix: review-start consults the calendar, gets the entry's id,
 * and resolves through the UUID binding to the actual file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
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

function run(subcommand: string, args: string[]): RunResult {
  const r = spawnSync(deskworkBin, [subcommand, ...args], { encoding: 'utf-8' });
  const stdout = r.stdout ?? '';
  let json: unknown;
  try {
    json = stdout.trim().length > 0 ? JSON.parse(stdout) : undefined;
  } catch {
    // not JSON
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
  project = mkdtempSync(join(tmpdir(), 'deskwork-review-uuid-'));
  // Use the same content layout as writingcontrol: hierarchical
  // (`projects/<slug>/index.md`), the path that broke pre-#67.
  const cfg = {
    version: 1,
    author: 'Test Author',
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

// SKIPPED: Pipeline-redesign Phase 4 (Tasks 21+22) retired the
// `review-start` verb. The CLI dispatcher gate now exits 1 with a
// stable retirement message. The Issue #67 fix (UUID-bound file
// resolution at non-template paths) is preserved on the new
// universal-verb path through `resolveEntryFilePath`; re-target these
// regression tests against `/deskwork:iterate` once the new flow is
// dogfood-tested.
describe.skip('review-start resolves UUID-bound file at non-template path (Issue #67)', () => {
  it('finds the file via the content index, not the slug template', () => {
    // Lay down a markdown file at a non-slug-template path with a
    // deskwork.id binding.
    write(
      'src/content/projects/the-outbound/index.md',
      '---\ndeskwork:\n  id: 11111111-2222-4333-8444-555555555555\ntitle: The Outbound\nstate: drafting\n---\n\n# The Outbound\n\nbody\n',
    );

    // Ingest it so the calendar entry exists and its id matches the
    // frontmatter binding (the ingest --apply path also writes the id
    // back into frontmatter, but it's already there in this fixture
    // and updateFrontmatter is round-trip-preserving).
    const ingest = run('ingest', [
      project,
      '--apply',
      '--state',
      'Drafting',
      '--slug',
      'the-outbound',
      'src/content/projects/the-outbound/index.md',
    ]);
    expect(ingest.code).toBe(0);

    // review-start with the entry's slug — should resolve through the
    // UUID binding even though no `<slug>/index.md` exists at the
    // slug-template path.
    const res = run('review-start', [project, 'the-outbound']);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(typeof res.json).toBe('object');
    expect(res.json).toMatchObject({
      slug: 'the-outbound',
      state: 'open',
    });
  });

  it('falls back to the slug-template when the entry has no UUID binding (legacy)', () => {
    // Pre-doctor / pre-ingest legacy state: slug-template file with no
    // deskwork.id binding. The fallback in resolveEntryFilePath kicks
    // in and finds the file at the conventional location.
    write(
      'src/content/legacy-post/index.md',
      '---\ntitle: Legacy\nstate: drafting\n---\n\n# Legacy\n',
    );
    // Ingest with --no-write-frontmatter so the file STAYS unbound,
    // simulating a calendar entry that hasn't gone through doctor yet.
    const ingest = run('ingest', [
      project,
      '--apply',
      '--no-write-frontmatter',
      '--state',
      'Drafting',
      '--slug',
      'legacy-post',
      'src/content/legacy-post/index.md',
    ]);
    expect(ingest.code).toBe(0);

    const res = run('review-start', [project, 'legacy-post']);
    expect(res.code).toBe(0);
    expect(res.json).toMatchObject({ slug: 'legacy-post' });
  });
});
