/**
 * Regression test for #147: deskwork CLI approve must dispatch entry-centric
 * (longform) approves to `approveEntryStage`, not the legacy workflow path
 * which crashes with a TypeError when no `review-journal/pipeline/*.json`
 * record exists for the entry.
 *
 * Mirrors the dispatcher split shipped for `iterate.ts` in Phase 30.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-approve-entry-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: {
          contentDir: 'docs',
          calendarPath: '.deskwork/calendar.md',
        },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function writeSidecar(uuid: string, slug: string, currentStage: string): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage,
      iterationByStage: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function readSidecar(uuid: string): { currentStage: string } {
  return JSON.parse(
    readFileSync(
      join(project, '.deskwork', 'entries', `${uuid}.json`),
      'utf-8',
    ),
  );
}

function approve(slug: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['approve', project, slug], {
    encoding: 'utf-8',
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('deskwork approve — entry-centric dispatcher (#147)', () => {
  it('advances an Ideas-stage entry to Planned without legacy workflow records', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    writeSidecar(uuid, 'my-idea', 'Ideas');

    const res = approve('my-idea');

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const out = JSON.parse(res.stdout);
    expect(out).toMatchObject({
      entryId: uuid,
      slug: 'my-idea',
      fromStage: 'Ideas',
      toStage: 'Planned',
    });
    expect(readSidecar(uuid).currentStage).toBe('Planned');
  });

  it('advances Planned → Outlining', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    writeSidecar(uuid, 'planned-idea', 'Planned');

    const res = approve('planned-idea');

    expect(res.code).toBe(0);
    expect(readSidecar(uuid).currentStage).toBe('Outlining');
  });

  it('refuses Final → Published with a clear error', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440002';
    writeSidecar(uuid, 'final-idea', 'Final');

    const res = approve('final-idea');

    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain('uses `publish`');
    expect(readSidecar(uuid).currentStage).toBe('Final');
  });

  it('refuses Published as terminal', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440003';
    writeSidecar(uuid, 'pub-idea', 'Published');

    const res = approve('pub-idea');

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/terminal/);
  });

  it('writes a stage-transition journal event on success', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440004';
    writeSidecar(uuid, 'journal-idea', 'Outlining');

    const res = approve('journal-idea');
    expect(res.code).toBe(0);

    const historyDir = join(project, '.deskwork', 'review-journal', 'history');
    expect(existsSync(historyDir)).toBe(true);
    const events = readdirSync(historyDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(historyDir, f), 'utf-8')));
    const transitions = events.filter(
      (e: { kind: string; entryId: string }) =>
        e.kind === 'stage-transition' && e.entryId === uuid,
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      kind: 'stage-transition',
      from: 'Outlining',
      to: 'Drafting',
      entryId: uuid,
    });
  });

  it('returns a clear error when the slug does not resolve to any sidecar', () => {
    const res = approve('nonexistent-slug');

    expect(res.code).not.toBe(0);
    // legacy path used to crash with TypeError; entry-centric path
    // returns a structured error from resolveEntryUuid
    expect(res.stderr).not.toMatch(/TypeError/);
    expect(res.stderr).toMatch(/nonexistent-slug/);
  });
});
