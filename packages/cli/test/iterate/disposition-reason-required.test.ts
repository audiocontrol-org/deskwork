/**
 * Phase 8 Task 8.5 Step 8.5.2 — CLI-parse-time refusal for missing
 * `reason` on `addressed` dispositions.
 *
 * Pairs with Step 8.1.2's write-side schema tightening (commit
 * 91954561) which already rejects an addressed annotation lacking
 * `reason` at the journal-write boundary. Step 8.5.2 catches it
 * EARLIER at the dispositions-file parse boundary so the operator
 * gets:
 *
 *   - exit code 2 (usage error, per the OutOfRangePositionError /
 *     Task 0.66 typed-error precedent),
 *   - an error message that names the offending commentId,
 *   - the expected shape inline,
 *
 * BEFORE any other work runs (no iterateEntry call, no journal-write
 * attempt). The Step 8.1.2 schema gate stays in place — Step 8.5.2 is
 * a friendlier upstream gate that fails fast with a clearer message.
 *
 * Drives the real `deskwork` binary against a tmp project tree on
 * disk — no fs mocks. Mirrors the pattern from
 * `iterate-entry-centric-dispositions.test.ts`.
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
const workspaceRoot = resolve(testDir, '../../../..');
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

function writeSidecar(uuid: string, slug: string): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage: 'Outlining',
      iterationByStage: {},
      artifactPath: `docs/${slug}/index.md`,
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    }),
    'utf-8',
  );
}

function writeArtifact(slug: string, body: string): void {
  const path = join(project, 'docs', slug, 'index.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, 'utf-8');
}

function seedEntryComment(entryId: string, commentId: string): void {
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
      text: 'a margin note',
    },
  };
  const safeAt = at.replace(/[:.]/g, '-');
  const file = join(
    project,
    '.deskwork',
    'review-journal',
    'history',
    `${safeAt}-${entryId}-entry-annotation-${commentId}.json`,
  );
  writeFileSync(file, JSON.stringify(event), 'utf-8');
}

function readJournalEvents(): Array<{ kind: string }> {
  const dir = join(project, '.deskwork', 'review-journal', 'history');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-iterate-disp-reason-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, '.deskwork', 'review-journal', 'history'), {
    recursive: true,
  });
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

describe('deskwork iterate — addressed disposition requires reason (Step 8.5.2)', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655448502';
  const COMMENT_ID = 'c8502001-0000-4000-8000-000000000001';

  function setup(): string {
    writeSidecar(UUID, 'reason-required');
    writeArtifact('reason-required', '# v1\n\nFirst draft body.\n');
    seedEntryComment(UUID, COMMENT_ID);
    // Mutate disk so iterate has something to snapshot.
    writeArtifact('reason-required', '# v1\n\nFirst draft body, edited.\n');
    const dispPath = join(project, '.dispositions.json');
    return dispPath;
  }

  it('exit 0 when addressed carries a non-empty reason', () => {
    const dispPath = setup();
    writeFileSync(
      dispPath,
      JSON.stringify({
        [COMMENT_ID]: {
          disposition: 'addressed',
          reason: 'addressed by editing the body in § 2',
        },
      }),
      'utf-8',
    );

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'reason-required',
    ]);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
  });

  it('exit 2 when addressed lacks the reason field — names commentId + shows shape', () => {
    const dispPath = setup();
    writeFileSync(
      dispPath,
      JSON.stringify({
        [COMMENT_ID]: { disposition: 'addressed' },
      }),
      'utf-8',
    );

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'reason-required',
    ]);

    expect(res.code).toBe(2);
    // Names the offending commentId.
    expect(res.stderr).toContain(COMMENT_ID);
    // Explains the constraint.
    expect(res.stderr).toMatch(/reason.*required.*addressed/);
    // Shows the expected shape inline so the operator can fix the file.
    expect(res.stderr).toMatch(/"disposition":\s*"addressed"/);
    expect(res.stderr).toMatch(/"reason":/);

    // No iteration was written — the fail-fast at parse time runs before
    // any journal-write attempt.
    const events = readJournalEvents();
    expect(events.filter((e) => e.kind === 'iteration')).toHaveLength(0);
  });

  it('exit 2 when addressed has an empty-string reason', () => {
    const dispPath = setup();
    writeFileSync(
      dispPath,
      JSON.stringify({
        [COMMENT_ID]: { disposition: 'addressed', reason: '' },
      }),
      'utf-8',
    );

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'reason-required',
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain(COMMENT_ID);
    expect(res.stderr).toMatch(/reason.*required.*addressed/);
  });

  it('exit 0 when deferred carries no reason — only addressed is gated', () => {
    const dispPath = setup();
    writeFileSync(
      dispPath,
      JSON.stringify({
        [COMMENT_ID]: { disposition: 'deferred' },
      }),
      'utf-8',
    );

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'reason-required',
    ]);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
  });

  it('exit 0 when wontfix carries no reason — only addressed is gated', () => {
    const dispPath = setup();
    writeFileSync(
      dispPath,
      JSON.stringify({
        [COMMENT_ID]: { disposition: 'wontfix' },
      }),
      'utf-8',
    );

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'reason-required',
    ]);

    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
  });

  it('the parse-time gate runs BEFORE the orphan-commentId skip', () => {
    // Even when the commentId in the dispositions file doesn't match
    // any real comment (orphan), the parse-time reason gate still
    // fires. This is the intentional ordering: the gate validates the
    // *file shape* before the runtime decides whether to apply each
    // entry. Otherwise an operator who mistypes a commentId AND
    // forgets a reason gets a silent no-op + a wrong file shape
    // sitting on disk for the next iteration.
    const dispPath = setup();
    writeFileSync(
      dispPath,
      JSON.stringify({
        'orphan-comment-id-xyz': { disposition: 'addressed' },
      }),
      'utf-8',
    );

    const res = run([
      'iterate',
      project,
      '--kind',
      'longform',
      '--dispositions',
      dispPath,
      'reason-required',
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('orphan-comment-id-xyz');
    expect(res.stderr).toMatch(/reason.*required.*addressed/);
  });
});
