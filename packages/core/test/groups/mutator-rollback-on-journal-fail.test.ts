/**
 * Regression test for AUDIT-20260530-93 (cross-model:
 * AUDIT-BARRAGE-codex-P7T7.2).
 *
 * Surface: all six group mutators —
 *   - `packages/core/src/groups/operations/create.ts:106-121`
 *   - `packages/core/src/groups/operations/update.ts:84-94`
 *   - `packages/core/src/groups/operations/add-member.ts:126-145`
 *   - `packages/core/src/groups/operations/remove-member.ts:72-89`
 *   - `packages/core/src/groups/operations/archive.ts:68-77`
 *   - `packages/core/src/groups/operations/archive.ts:104-109`
 *
 * Every mutator wrote the sidecar BEFORE appending its `group-*`
 * journal event. If the journal append fails AFTER the sidecar
 * write, the on-disk sidecar state mutated with no audit record —
 * the same shape AUDIT-20260530-79 closed for the doctor's lane-
 * repair branches via the snapshot/restore pattern.
 *
 * Fix shape (mirrors AUDIT-79 + AUDIT-13): wrap each mutator's
 * sidecar-write + journal-append in a compensating-write helper
 * (`withJournalRollback`) that snapshots the sidecar before the
 * mutation and restores it on journal-append failure. For `create`
 * specifically, the "snapshot" records that the file was absent;
 * rollback deletes the just-created file.
 *
 * The test forces the journal failure the same way the AUDIT-79
 * regression test does: pre-create
 * `.deskwork/review-journal/history` as a FILE (not a directory) so
 * the journal's `mkdir(..., { recursive: true })` step hits ENOTDIR
 * / EEXIST and the append throws.
 *
 * Per the project's testing rules: fixtures live on disk in tmp
 * directories — no filesystem mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addGroupMember,
  archiveGroup,
  createGroup,
  removeGroupMember,
  restoreGroup,
  updateGroup,
} from '@/groups';
import { writeSidecar } from '@/sidecar/write.ts';
import { sidecarPath } from '@/sidecar/paths.ts';
import type { Entry } from '@/schema/entry.ts';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'dw-group-rb-'));
  mkdirSync(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
  writeFileSync(
    join(projectRoot, '.deskwork', 'config.json'),
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
    join(projectRoot, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
  writeFileSync(
    join(projectRoot, '.deskwork', 'lanes', 'default.json'),
    JSON.stringify({
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    }),
    'utf-8',
  );
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function makeEntry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
  return {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: {},
    lane: 'default',
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * Pre-create `.deskwork/review-journal/history` as a FILE (not a
 * directory). The journal's append code mkdirs that path; passing a
 * non-directory file causes the recursive mkdir to throw ENOTDIR.
 * Mirrors the AUDIT-20260530-79 regression test's failure-induction
 * pattern.
 */
function blockJournalAppend(root: string): void {
  const journalParent = join(root, '.deskwork', 'review-journal');
  mkdirSync(journalParent, { recursive: true });
  writeFileSync(join(journalParent, 'history'), 'not-a-dir', 'utf8');
}

describe('group mutators roll back sidecar on journal-append failure (AUDIT-20260530-93)', () => {
  it('createGroup: rolls back (deletes) the just-created sidecar when journal append fails', async () => {
    blockJournalAppend(projectRoot);

    const uuid = '550e8400-e29b-41d4-a716-446655440a01';

    let caught: unknown;
    try {
      await createGroup(projectRoot, {
        slug: 'doomed-group',
        title: 'Doomed Group',
        lane: 'default',
        uuid,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    // Pre-fix the sidecar landed on disk before the journal append
    // failed, so the entry persisted with no audit record. Post-fix
    // the rollback deletes the just-created sidecar.
    const path = sidecarPath(projectRoot, uuid);
    expect(existsSync(path)).toBe(false);
  });

  it('updateGroup: restores the prior sidecar body when journal append fails', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440a02';
    const group = makeEntry(uuid, 'g-update', { members: [] });
    await writeSidecar(projectRoot, group);
    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');

    blockJournalAppend(projectRoot);

    let caught: unknown;
    try {
      await updateGroup(projectRoot, {
        slugOrUuid: uuid,
        title: 'New Title',
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
    expect(afterBody).toBe(originalBody);
  });

  it('addGroupMember: restores the prior sidecar body when journal append fails', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440a03';
    const memberUuid = '550e8400-e29b-41d4-a716-446655440a04';
    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-add', { members: [] }));
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-1'));
    const originalBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');

    blockJournalAppend(projectRoot);

    let caught: unknown;
    try {
      await addGroupMember(projectRoot, {
        groupSlugOrUuid: groupUuid,
        memberSlugOrUuid: memberUuid,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const afterBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
    expect(afterBody).toBe(originalBody);
  });

  it('removeGroupMember: restores the prior sidecar body when journal append fails', async () => {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440a05';
    const memberUuid = '550e8400-e29b-41d4-a716-446655440a06';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-2'));
    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-remove', { members: [memberUuid] }));
    const originalBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');

    blockJournalAppend(projectRoot);

    let caught: unknown;
    try {
      await removeGroupMember(projectRoot, {
        groupSlugOrUuid: groupUuid,
        memberSlugOrUuid: memberUuid,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const afterBody = readFileSync(sidecarPath(projectRoot, groupUuid), 'utf8');
    expect(afterBody).toBe(originalBody);
  });

  it('archiveGroup: restores the prior sidecar body when journal append fails', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440a07';
    await writeSidecar(projectRoot, makeEntry(uuid, 'g-arch', { members: [] }));
    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');

    blockJournalAppend(projectRoot);

    let caught: unknown;
    try {
      await archiveGroup(projectRoot, uuid);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
    expect(afterBody).toBe(originalBody);
  });

  it('restoreGroup: restores the prior sidecar body when journal append fails', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440a08';
    await writeSidecar(
      projectRoot,
      makeEntry(uuid, 'g-rest', {
        members: [],
        archivedAt: '2026-04-30T11:00:00.000Z',
      }),
    );
    const originalBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');

    blockJournalAppend(projectRoot);

    let caught: unknown;
    try {
      await restoreGroup(projectRoot, uuid);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const afterBody = readFileSync(sidecarPath(projectRoot, uuid), 'utf8');
    expect(afterBody).toBe(originalBody);
  });
});
