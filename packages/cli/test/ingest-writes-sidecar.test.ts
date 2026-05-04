/**
 * Integration tests for `deskwork ingest --apply` writing the
 * entry-centric sidecar at `.deskwork/entries/<uuid>.json` (Issue #183).
 *
 * Phase 30 made per-entry sidecars the SSOT — calendar.md is regenerated
 * from them. Before the fix, ingest minted a UUID, appended a calendar
 * row, and stamped frontmatter, but never wrote the sidecar. The studio
 * dashboard and entry-review surfaces (which read sidecars) couldn't
 * see the new row, and `deskwork doctor --check` immediately reported
 * `calendar-sidecar` drift.
 *
 * The fix: after appending the calendar entry, ingest writes a
 * complete `Entry` to `<projectRoot>/.deskwork/entries/<uuid>.json` via
 * `writeSidecar`. Schema-required fields populated from the candidate;
 * `artifactPath` recorded relative to `contentDir`.
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
  project = mkdtempSync(join(tmpdir(), 'deskwork-ingest-sc-'));
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

function readSidecarFromFrontmatterId(filePath: string): {
  uuid: string;
  sidecar: Record<string, unknown>;
} {
  const parsed = parseFrontmatter(readFileSync(filePath, 'utf-8'));
  const block = parsed.data.deskwork;
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new Error('source file has no deskwork frontmatter block');
  }
  const id = (block as Record<string, unknown>).id;
  if (typeof id !== 'string') {
    throw new Error('source file has no deskwork.id');
  }
  const sidecarPath = join(project, '.deskwork', 'entries', `${id}.json`);
  if (!existsSync(sidecarPath)) {
    throw new Error(`sidecar not written at ${sidecarPath}`);
  }
  return {
    uuid: id,
    sidecar: JSON.parse(readFileSync(sidecarPath, 'utf-8')) as Record<string, unknown>,
  };
}

describe('deskwork ingest --apply writes entry-centric sidecar (Issue #183)', () => {
  it('writes a sidecar at .deskwork/entries/<uuid>.json after a successful ingest', () => {
    const file = write(
      'src/content/posts/hello.md',
      '---\ntitle: Hello\nstate: drafting\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', file]);
    expect(res.code).toBe(0);

    const { uuid, sidecar } = readSidecarFromFrontmatterId(file);
    expect(typeof uuid).toBe('string');
    expect(sidecar.uuid).toBe(uuid);
    expect(sidecar.slug).toBe('hello');
    expect(sidecar.title).toBe('Hello');
    expect(sidecar.currentStage).toBe('Drafting');
    expect(sidecar.source).toBe('manual');
    expect(sidecar.keywords).toEqual([]);
    expect(sidecar.iterationByStage).toEqual({});
    expect(sidecar.artifactPath).toBe('src/content/posts/hello.md');
    expect(typeof sidecar.createdAt).toBe('string');
    expect(typeof sidecar.updatedAt).toBe('string');
  });

  it('Published candidates carry datePublished as ISO datetime', () => {
    const file = write(
      'src/content/posts/launched.md',
      '---\ntitle: Launched\nstate: published\ndatePublished: 2024-06-01\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', file]);
    expect(res.code).toBe(0);

    const { sidecar } = readSidecarFromFrontmatterId(file);
    expect(sidecar.currentStage).toBe('Published');
    expect(sidecar.datePublished).toBe('2024-06-01T00:00:00.000Z');
  });

  it('non-Published candidates omit datePublished from the sidecar', () => {
    const file = write(
      'src/content/posts/idea.md',
      '---\ntitle: Idea\nstate: idea\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', file]);
    expect(res.code).toBe(0);

    const { sidecar } = readSidecarFromFrontmatterId(file);
    expect(sidecar.currentStage).toBe('Ideas');
    expect('datePublished' in sidecar).toBe(false);
  });

  it('artifactPath is computed relative to contentDir, not projectRoot', () => {
    const file = write(
      'src/content/posts/nested/deep/note.md',
      '---\ntitle: Deep\nstate: drafting\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', file]);
    expect(res.code).toBe(0);

    const { sidecar } = readSidecarFromFrontmatterId(file);
    expect(sidecar.artifactPath).toBe('src/content/posts/nested/deep/note.md');
  });

  it('description is preserved from frontmatter when present', () => {
    const file = write(
      'src/content/posts/described.md',
      '---\ntitle: Described\ndescription: A short blurb\nstate: drafting\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', file]);
    expect(res.code).toBe(0);

    const { sidecar } = readSidecarFromFrontmatterId(file);
    expect(sidecar.description).toBe('A short blurb');
  });

  it('after ingest --apply, doctor --check reports zero calendar-sidecar drift', () => {
    write(
      'src/content/posts/one.md',
      '---\ntitle: One\nstate: drafting\n---\n\nbody\n',
    );
    write(
      'src/content/posts/two.md',
      '---\ntitle: Two\nstate: idea\n---\n\nbody\n',
    );

    const ingestRes = run('ingest', [project, '--apply', 'src/content/posts/']);
    expect(ingestRes.code).toBe(0);

    const doctorRes = run('doctor', [project, '--check']);
    // Doctor exit code is 0 when no findings; we accept 0 here.
    expect(doctorRes.code).toBe(0);
    expect(doctorRes.stdout).not.toContain('calendar-sidecar');
    expect(doctorRes.stderr).not.toContain('calendar-sidecar');
  });

  it('--no-write-frontmatter still writes the sidecar (calendar.md must reference a real sidecar)', () => {
    const file = write(
      'src/content/posts/no-fm.md',
      '---\ntitle: No FM\nstate: drafting\n---\n\nbody\n',
    );

    const res = run('ingest', [project, '--apply', '--no-write-frontmatter', file]);
    expect(res.code).toBe(0);

    // The source file is unmodified — so we can't read the UUID from
    // its frontmatter. Instead read it from the calendar row.
    const calendarRaw = readFileSync(
      join(project, 'docs', 'calendar.md'),
      'utf-8',
    );
    const uuidMatch = calendarRaw.match(
      /\| ([0-9a-f-]{36}) \| no-fm \|/,
    );
    expect(uuidMatch).not.toBeNull();
    if (!uuidMatch) return;
    const sidecarPath = join(
      project,
      '.deskwork',
      'entries',
      `${uuidMatch[1]}.json`,
    );
    expect(existsSync(sidecarPath)).toBe(true);
  });
});
