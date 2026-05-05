/**
 * Regression test for #198: `deskwork iterate --kind longform --dispositions <path>`
 * (and `--kind outline`) must mint `address` annotations into the
 * entry-keyed annotation store. Pre-fix this path threw
 * `--dispositions is currently only supported with --kind=shortform.`
 *
 * Mirrors the entry-centric dispatcher pattern from
 * `approve-entry-centric.test.ts`. Drives the real `deskwork` binary
 * against a tmp project tree on disk — no fs mocks.
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

let project: string;

function run(args: string[]): RunResult {
  const r = spawnSync(deskworkBin, args, { encoding: 'utf-8' });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

interface SidecarFixture {
  uuid: string;
  slug: string;
  currentStage: 'Outlining' | 'Drafting' | 'Final' | 'Ideas' | 'Planned';
  iterationByStage?: Record<string, number>;
}

function writeSidecar(fix: SidecarFixture): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${fix.uuid}.json`),
    JSON.stringify({
      uuid: fix.uuid,
      slug: fix.slug,
      title: fix.slug,
      keywords: [],
      source: 'manual',
      currentStage: fix.currentStage,
      iterationByStage: fix.iterationByStage ?? {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    }),
    'utf-8',
  );
}

function writeStageArtifact(slug: string, stage: SidecarFixture['currentStage'], body: string): void {
  // Mirrors STAGE_ARTIFACT_PATH in packages/core/src/iterate/iterate.ts.
  const rel: Record<string, string> = {
    Ideas: `docs/${slug}/scrapbook/idea.md`,
    Planned: `docs/${slug}/scrapbook/plan.md`,
    Outlining: `docs/${slug}/scrapbook/outline.md`,
    Drafting: `docs/${slug}/index.md`,
    Final: `docs/${slug}/index.md`,
  };
  const path = join(project, rel[stage]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf-8');
}

function readJournalEvents(): Array<{ kind: string; entryId?: string; annotation?: { type?: string; commentId?: string; id?: string; version?: number; disposition?: string; reason?: string } }> {
  const dir = join(project, '.deskwork', 'review-journal', 'history');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

/**
 * Seed an `entry-annotation` event of type 'comment' onto the entry
 * journal, so the iterate path has a real comment id to address against.
 */
function seedEntryComment(entryId: string, commentId: string, text: string): void {
  const at = new Date(Date.now() - 60_000).toISOString();
  const event = {
    kind: 'entry-annotation',
    at,
    entryId,
    annotation: {
      id: commentId,
      workflowId: entryId,
      createdAt: at,
      type: 'comment',
      version: 1,
      range: { start: 0, end: 4 },
      text,
    },
  };
  // `appendJournalEvent` names files by `at-entryId-kind.json`. We mimic
  // that here so the read path works the same.
  const safeAt = at.replace(/[:.]/g, '-');
  const file = join(
    project,
    '.deskwork',
    'review-journal',
    'history',
    `${safeAt}-${entryId}-entry-annotation.json`,
  );
  writeFileSync(file, JSON.stringify(event), 'utf-8');
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-iterate-entry-disp-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, '.deskwork', 'review-journal', 'history'), { recursive: true });
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

describe('deskwork iterate — entry-centric dispositions (#198)', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655442001';
  const COMMENT_ID = 'c0000001-0000-4000-8000-000000000001';

  function setupOutliningEntryWithComment(): void {
    writeSidecar({ uuid: UUID, slug: 'with-comments', currentStage: 'Outlining' });
    writeStageArtifact('with-comments', 'Outlining', '# v1 outline\n\nFirst draft body.\n');
    seedEntryComment(UUID, COMMENT_ID, 'Tighten the intro');
  }

  function writeDispositions(payload: unknown): string {
    const dispPath = join(project, '.dispositions.json');
    writeFileSync(dispPath, JSON.stringify(payload), 'utf-8');
    return dispPath;
  }

  it('--kind longform records an address annotation against an existing comment', () => {
    setupOutliningEntryWithComment();
    // Mutate the disk artifact so iterate has something to snapshot.
    writeStageArtifact(
      'with-comments',
      'Outlining',
      '# v1 outline\n\nFirst draft body, tightened intro.\n',
    );

    const dispPath = writeDispositions({
      [COMMENT_ID]: { disposition: 'addressed' },
    });

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'with-comments',
    ]);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const out = JSON.parse(res.stdout) as {
      entryId: string;
      version: number;
      addressedComments: string[];
    };
    expect(out.entryId).toBe(UUID);
    expect(out.version).toBe(1);
    expect(out.addressedComments).toEqual([COMMENT_ID]);

    const events = readJournalEvents();
    const addressEvents = events.filter(
      (e) => e.kind === 'entry-annotation' && e.annotation?.type === 'address',
    );
    expect(addressEvents).toHaveLength(1);
    expect(addressEvents[0].entryId).toBe(UUID);
    expect(addressEvents[0].annotation).toMatchObject({
      type: 'address',
      commentId: COMMENT_ID,
      version: 1,
      disposition: 'addressed',
    });
  });

  it('--kind outline records an address annotation against an existing comment', () => {
    setupOutliningEntryWithComment();
    writeStageArtifact(
      'with-comments',
      'Outlining',
      '# v1 outline\n\nOutline body, tightened.\n',
    );

    const dispPath = writeDispositions({
      [COMMENT_ID]: { disposition: 'deferred', reason: 'next pass' },
    });

    const res = run([
      'iterate',
      project,
      '--kind',
      'outline',
      '--dispositions',
      dispPath,
      'with-comments',
    ]);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const out = JSON.parse(res.stdout) as {
      addressedComments: string[];
      version: number;
    };
    expect(out.addressedComments).toEqual([COMMENT_ID]);

    const events = readJournalEvents();
    const addressEvents = events.filter(
      (e) => e.kind === 'entry-annotation' && e.annotation?.type === 'address',
    );
    expect(addressEvents).toHaveLength(1);
    expect(addressEvents[0].annotation).toMatchObject({
      type: 'address',
      commentId: COMMENT_ID,
      disposition: 'deferred',
      reason: 'next pass',
    });
  });

  it('silently skips disposition entries that do not match a real comment', () => {
    setupOutliningEntryWithComment();
    writeStageArtifact(
      'with-comments',
      'Outlining',
      '# v1 outline\n\nUpdated body.\n',
    );

    const dispPath = writeDispositions({
      'orphan-comment-id-xyz': { disposition: 'addressed' },
    });

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'with-comments',
    ]);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const out = JSON.parse(res.stdout) as { addressedComments: string[] };
    expect(out.addressedComments).toEqual([]);

    const events = readJournalEvents();
    const addressEvents = events.filter(
      (e) => e.kind === 'entry-annotation' && e.annotation?.type === 'address',
    );
    expect(addressEvents).toHaveLength(0);
  });

  it('fails with exit 2 + canonical error when the dispositions JSON is malformed', () => {
    setupOutliningEntryWithComment();

    const dispPath = join(project, '.bad.json');
    writeFileSync(dispPath, '{not valid json', 'utf-8');

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'with-comments',
    ]);

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--dispositions: invalid JSON at/);
    // Original artifact must NOT have been touched — fail-fast happens
    // before iterateEntry runs.
    const events = readJournalEvents();
    expect(events.filter((e) => e.kind === 'iteration')).toHaveLength(0);
  });

  it('fails when the dispositions JSON is the wrong shape (top-level array)', () => {
    setupOutliningEntryWithComment();

    const dispPath = join(project, '.bad-shape.json');
    writeFileSync(dispPath, '[]', 'utf-8');

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'with-comments',
    ]);

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--dispositions: expected JSON object at/);
  });

  it('fails when a disposition value is not one of the allowed strings', () => {
    setupOutliningEntryWithComment();

    const dispPath = writeDispositions({
      [COMMENT_ID]: { disposition: 'maybe-later' },
    });

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'with-comments',
    ]);

    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(
      /--dispositions\[.*\]\.disposition: must be 'addressed' \| 'deferred' \| 'wontfix'/,
    );
  });

  it('--kind longform without --dispositions still works and emits empty addressedComments', () => {
    writeSidecar({ uuid: UUID, slug: 'no-dispositions', currentStage: 'Outlining' });
    writeStageArtifact('no-dispositions', 'Outlining', '# outline body\n');

    const res = run(['iterate', project, '--kind', 'longform', 'no-dispositions']);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const out = JSON.parse(res.stdout) as { addressedComments: string[] };
    expect(out.addressedComments).toEqual([]);
  });
});
