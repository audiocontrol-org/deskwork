/**
 * Integration tests for `deskwork add` writing the entry-centric
 * sidecar at `.deskwork/entries/<uuid>.json` (Issue #184 — sibling
 * of #183).
 *
 * Phase 30 made per-entry sidecars the SSOT. `deskwork add`
 * pre-#184 wrote calendar.md + minted a UUID but never wrote the
 * sidecar; the new entry was invisible on the studio dashboard and
 * `doctor --check` immediately reported `calendar-sidecar` drift.
 *
 * The fix: `add` calls the shared `createFreshEntrySidecar` helper
 * (the same one #183's fix uses for ingest) after `writeCalendar`.
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
  project = mkdtempSync(join(tmpdir(), 'deskwork-add-sc-'));
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

function readSidecar(uuid: string): Record<string, unknown> {
  const path = join(project, '.deskwork', 'entries', `${uuid}.json`);
  if (!existsSync(path)) {
    throw new Error(`sidecar not written at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

function uuidFromAddOutput(stdout: string): string {
  // `deskwork add` emits a JSON blob with slug/title/etc. but not the
  // UUID directly — read it from calendar.md by slug.
  const parsed = JSON.parse(stdout) as { slug: string };
  const calendarRaw = readFileSync(join(project, 'docs', 'calendar.md'), 'utf-8');
  const m = calendarRaw.match(
    new RegExp(`\\| ([0-9a-f-]{36}) \\| ${parsed.slug.replace(/[\/.]/g, '\\$&')} \\|`),
  );
  if (!m) throw new Error(`could not find UUID for slug "${parsed.slug}" in calendar.md`);
  return m[1];
}

describe('deskwork add writes entry-centric sidecar (Issue #184)', () => {
  it('writes a sidecar at .deskwork/entries/<uuid>.json after add', () => {
    const res = run('add', [project, 'My new idea']);
    expect(res.code).toBe(0);

    const uuid = uuidFromAddOutput(res.stdout);
    const sidecar = readSidecar(uuid);

    expect(sidecar.uuid).toBe(uuid);
    expect(sidecar.slug).toBe('my-new-idea');
    expect(sidecar.title).toBe('My new idea');
    expect(sidecar.currentStage).toBe('Ideas');
    expect(sidecar.source).toBe('manual');
    expect(sidecar.keywords).toEqual([]);
    expect(sidecar.iterationByStage).toEqual({});
    expect('artifactPath' in sidecar).toBe(false);
    expect('datePublished' in sidecar).toBe(false);
    expect(typeof sidecar.createdAt).toBe('string');
    expect(typeof sidecar.updatedAt).toBe('string');
  });

  it('description is preserved in the sidecar', () => {
    const res = run('add', [project, 'Described idea', 'a clear description']);
    expect(res.code).toBe(0);

    const uuid = uuidFromAddOutput(res.stdout);
    const sidecar = readSidecar(uuid);
    expect(sidecar.description).toBe('a clear description');
  });

  it('--source analytics is reflected in the sidecar', () => {
    const res = run('add', [project, '--source', 'analytics', 'From analytics']);
    expect(res.code).toBe(0);

    const uuid = uuidFromAddOutput(res.stdout);
    const sidecar = readSidecar(uuid);
    expect(sidecar.source).toBe('analytics');
  });

  it('--slug override is reflected in both calendar and sidecar', () => {
    const res = run('add', [
      project,
      '--slug',
      'nested/path/entry',
      'Nested Entry',
    ]);
    expect(res.code).toBe(0);

    const uuid = uuidFromAddOutput(res.stdout);
    const sidecar = readSidecar(uuid);
    expect(sidecar.slug).toBe('nested/path/entry');
  });

  it('after add, doctor --check reports zero calendar-sidecar drift', () => {
    // `add` legitimately leaves doctor with `missing-frontmatter-id` +
    // `file-presence` findings (the entry isn't bound to a file until
    // the operator runs the next lifecycle step). Those are out of
    // scope for #184 — assert only that calendar-sidecar drift is not
    // present (the specific bug we fixed).
    const r1 = run('add', [project, 'First idea']);
    expect(r1.code).toBe(0);
    const r2 = run('add', [project, 'Second idea', 'with description']);
    expect(r2.code).toBe(0);

    const doctorRes = run('doctor', [project, '--check']);
    const combined = `${doctorRes.stdout}\n${doctorRes.stderr}`;
    expect(combined).not.toContain('calendar-sidecar');
  });

  it('sidecar uuid matches the calendar row UUID (no drift between disk artifacts)', () => {
    const res = run('add', [project, 'Match check']);
    expect(res.code).toBe(0);

    const uuid = uuidFromAddOutput(res.stdout);
    const sidecar = readSidecar(uuid);
    expect(sidecar.uuid).toBe(uuid);
  });
});
