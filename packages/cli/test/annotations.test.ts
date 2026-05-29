/**
 * Test for #267: `deskwork annotations <slug-or-uuid>` enumerates an
 * entry's comment annotations and surfaces the PENDING ones.
 *
 * A "comment" annotation carries no disposition itself — disposition is
 * recorded by separate `address` annotations that reference the comment
 * by `commentId` (latest-wins per comment id). PENDING therefore means:
 * a folded comment with no `address` annotation referencing it.
 *
 * Mirrors the on-disk fixture harness of
 * `iterate-entry-centric-dispositions.test.ts` — drives the real
 * `deskwork` binary against a tmp project tree. No fs mocks.
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
      currentStage: 'Drafting',
      iterationByStage: {},
      artifactPath: `docs/${slug}/index.md`,
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    }),
    'utf-8',
  );
}

/**
 * Seed a `comment` entry-annotation event. `appendJournalEvent` names
 * files `<safeAt>-<entryId>-<kind>.json`; we suffix with the comment id
 * so back-to-back seeds in the same millisecond don't collide.
 */
function seedComment(
  entryId: string,
  commentId: string,
  text: string,
  atMsAgo = 60_000,
): void {
  const at = new Date(Date.now() - atMsAgo).toISOString();
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
  writeEvent(at, entryId, `comment-${commentId}`, event);
}

/**
 * Seed an `address` entry-annotation event referencing `commentId` with
 * a disposition — the mechanism by which a comment becomes dispositioned.
 */
function seedAddress(
  entryId: string,
  commentId: string,
  disposition: 'addressed' | 'deferred' | 'wontfix',
  atMsAgo = 30_000,
): void {
  const at = new Date(Date.now() - atMsAgo).toISOString();
  const event = {
    kind: 'entry-annotation',
    at,
    entryId,
    annotation: {
      id: `addr-${commentId}`,
      workflowId: entryId,
      createdAt: at,
      type: 'address',
      commentId,
      version: 1,
      disposition,
    },
  };
  writeEvent(at, entryId, `address-${commentId}`, event);
}

function writeEvent(
  at: string,
  entryId: string,
  suffix: string,
  event: unknown,
): void {
  const safeAt = at.replace(/[:.]/g, '-');
  const file = join(
    project,
    '.deskwork',
    'review-journal',
    'history',
    `${safeAt}-${entryId}-entry-annotation-${suffix}.json`,
  );
  writeFileSync(file, JSON.stringify(event), 'utf-8');
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-annotations-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, '.deskwork', 'review-journal', 'history'), {
    recursive: true,
  });
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
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe('deskwork annotations (#267)', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655442670';
  const C_PENDING = 'c2670001-0000-4000-8000-000000000001';
  const C_ADDRESSED = 'c2670002-0000-4000-8000-000000000002';
  const SLUG = 'with-comments';

  function setupOnePendingOneAddressed(): void {
    writeSidecar(UUID, SLUG);
    seedComment(UUID, C_PENDING, 'Tighten the intro', 90_000);
    seedComment(UUID, C_ADDRESSED, 'Fix the typo', 80_000);
    seedAddress(UUID, C_ADDRESSED, 'addressed', 30_000);
  }

  it('lists only PENDING comments by default', () => {
    setupOnePendingOneAddressed();

    const res = run(['annotations', project, SLUG]);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(C_PENDING);
    expect(res.stdout).toContain('Tighten the intro');
    // The addressed comment is NOT in default (pending-only) output.
    expect(res.stdout).not.toContain(C_ADDRESSED);
    expect(res.stdout).not.toContain('Fix the typo');
  });

  it('--all includes the dispositioned comment with its disposition', () => {
    setupOnePendingOneAddressed();

    const res = run(['annotations', project, SLUG, '--all']);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(C_PENDING);
    expect(res.stdout).toContain('pending');
    expect(res.stdout).toContain(C_ADDRESSED);
    expect(res.stdout).toContain('addressed');
  });

  it('--json emits the documented shape with explicit pending disposition', () => {
    setupOnePendingOneAddressed();

    const res = run(['annotations', project, SLUG, '--all', '--json']);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const out = JSON.parse(res.stdout) as {
      entryId: string;
      annotations: Array<{
        commentId: string;
        text: string;
        disposition: string;
      }>;
    };
    expect(out.entryId).toBe(UUID);

    const pending = out.annotations.find((a) => a.commentId === C_PENDING);
    const addressed = out.annotations.find((a) => a.commentId === C_ADDRESSED);
    expect(pending).toBeDefined();
    // pending is represented as the literal string "pending".
    expect(pending?.disposition).toBe('pending');
    expect(pending?.text).toBe('Tighten the intro');
    expect(addressed).toBeDefined();
    expect(addressed?.disposition).toBe('addressed');
  });

  it('--json (default, pending-only) carries only pending comments', () => {
    setupOnePendingOneAddressed();

    const res = run(['annotations', project, SLUG, '--json']);
    expect(res.code).toBe(0);
    const out = JSON.parse(res.stdout) as {
      annotations: Array<{ commentId: string; disposition: string }>;
    };
    expect(out.annotations).toHaveLength(1);
    expect(out.annotations[0].commentId).toBe(C_PENDING);
    expect(out.annotations[0].disposition).toBe('pending');
  });

  it('resolves the entry by SLUG and by UUID (same entry)', () => {
    setupOnePendingOneAddressed();

    const bySlug = run(['annotations', project, SLUG, '--json']);
    const byUuid = run(['annotations', project, UUID, '--json']);
    expect(bySlug.code).toBe(0);
    expect(byUuid.code).toBe(0);

    const a = JSON.parse(bySlug.stdout) as { entryId: string };
    const b = JSON.parse(byUuid.stdout) as { entryId: string };
    expect(a.entryId).toBe(UUID);
    expect(b.entryId).toBe(UUID);
  });

  it('no slug-or-uuid arg → exit 2 + usage on stderr', () => {
    const res = run(['annotations', project]);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork annotations/);
  });

  it('unknown entry → non-zero exit + descriptive error', () => {
    // No sidecar written; the slug cannot be resolved.
    const res = run(['annotations', project, 'no-such-slug']);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not found/);
    // Must NOT silently succeed with an empty list.
    expect(res.stdout).toBe('');
  });

  it('unknown UUID → non-zero exit + descriptive error (no silent empty success)', () => {
    const ghost = '00000000-0000-4000-8000-000000000999';
    const res = run(['annotations', project, ghost]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/sidecar not found|not found/);
    expect(res.stdout).toBe('');
  });

  it('entry with zero comments → exit 0 + clear "no pending annotations" message', () => {
    writeSidecar(UUID, SLUG);

    const res = run(['annotations', project, SLUG]);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(res.stdout.toLowerCase()).toContain('no pending annotations');
  });

  it('entry with only dispositioned comments → default mode reports no pending', () => {
    writeSidecar(UUID, SLUG);
    seedComment(UUID, C_ADDRESSED, 'Fix the typo', 80_000);
    seedAddress(UUID, C_ADDRESSED, 'wontfix', 30_000);

    const res = run(['annotations', project, SLUG]);
    expect(res.code).toBe(0);
    expect(res.stdout.toLowerCase()).toContain('no pending annotations');

    // --all surfaces the dispositioned one with its disposition.
    const all = run(['annotations', project, SLUG, '--all']);
    expect(all.code).toBe(0);
    expect(all.stdout).toContain(C_ADDRESSED);
    expect(all.stdout).toContain('wontfix');
  });
});
