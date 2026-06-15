/**
 * Phase 39c-2b(a) — publish's legacy (no-sidecar) repo-content branch
 * must stop resolving the artifact via the slug+stage template
 * (`resolveEntryFilePath`) and instead point the operator at
 * `deskwork doctor --fix`.
 *
 * Resolution now reads the stored `entry.artifactPath` only (spec
 * Decision #14). A repo-content (blog) calendar entry with NO sidecar
 * has no authoritative path — it is an unmigrated entry. Per the
 * "missing-path throws with doctor --fix guidance (no slug+stage
 * search)" contract, publish refuses it and names the migration.
 *
 * The externally-hosted branch (youtube/tool via `--content-url`) is
 * unchanged — it never resolved a repo file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-publish-legacy-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

/** Write a calendar with one Drafting blog entry and NO sidecar for it. */
function writeLegacyCalendar(uuid: string, slug: string): void {
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    [
      '# Editorial Calendar',
      '',
      '## Drafting',
      '',
      '| UUID | Slug | Title | Description | Keywords | Source |',
      '|------|------|------|------|------|------|',
      `| ${uuid} | ${slug} | Legacy Blog | desc | kw | manual |`,
      '',
    ].join('\n'),
    'utf-8',
  );
}

function publish(slug: string, ...flags: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['publish', project, ...flags, slug], {
    encoding: 'utf-8',
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('deskwork publish — legacy repo-content resolution (39c-2b a)', () => {
  it('refuses an unmigrated (no-sidecar) blog entry, pointing at doctor --fix instead of a slug+stage search', () => {
    const uuid = '550e8400-e29b-41d4-a716-4466554409aa';
    writeLegacyCalendar(uuid, 'legacy-blog');

    const res = publish('legacy-blog');

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/doctor --fix/);
    // It must NOT report a slug-template path it searched (the old behavior).
    expect(res.stderr).not.toMatch(/no file at .*docs\/legacy-blog/);
  });
});
