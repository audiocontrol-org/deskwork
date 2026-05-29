/**
 * Core-layer integration tests for the group operations module.
 *
 * Phase 7 Task 7.2 (graphical-entries). Each test uses a fresh tmp
 * project root (mkdtempSync) with a real lane config + editorial
 * pipeline preset; the operations exercise the full sidecar +
 * journal write path. No mocks.
 *
 * Mirrors `packages/core/test/lanes/loader.test.ts` in fixture
 * shape; the CLI-side tests at `packages/cli/test/group/` cover
 * the spawnSync end-to-end path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addGroupMember,
  archiveGroup,
  createGroup,
  isArchivedEntry,
  isGroupEntry,
  listGroups,
  removeGroupMember,
  restoreGroup,
  showGroup,
  updateGroup,
} from '@/groups';
import { writeSidecar } from '@/sidecar/write.ts';
import type { Entry } from '@/schema/entry.ts';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'dw-groups-core-'));
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

describe('isGroupEntry / isArchivedEntry predicates', () => {
  it('isGroupEntry returns true only when members is a non-empty array', () => {
    const m = '550e8400-e29b-41d4-a716-446655440f01';
    expect(isGroupEntry(makeEntry('550e8400-e29b-41d4-a716-446655440f02', 'regular'))).toBe(false);
    expect(isGroupEntry(makeEntry('550e8400-e29b-41d4-a716-446655440f03', 'empty', { members: [] }))).toBe(false);
    expect(isGroupEntry(makeEntry('550e8400-e29b-41d4-a716-446655440f04', 'g', { members: [m] }))).toBe(true);
  });

  it('isArchivedEntry returns true only for non-empty archivedAt strings', () => {
    expect(isArchivedEntry(makeEntry('550e8400-e29b-41d4-a716-446655440f10', 'a'))).toBe(false);
    expect(isArchivedEntry(makeEntry('550e8400-e29b-41d4-a716-446655440f11', 'a', { archivedAt: '' as unknown as string }))).toBe(false);
    expect(isArchivedEntry(makeEntry('550e8400-e29b-41d4-a716-446655440f12', 'a', { archivedAt: '2026-05-28T10:00:00.000Z' }))).toBe(true);
  });
});

describe('createGroup', () => {
  it('writes a new group entry with members: []', async () => {
    const result = await createGroup(projectRoot, {
      slug: 'new-group',
      title: 'New Group',
      lane: 'default',
    });
    expect(result.entry.slug).toBe('new-group');
    expect(result.entry.title).toBe('New Group');
    expect(result.entry.lane).toBe('default');
    expect(result.entry.members).toEqual([]);
    expect(result.entry.currentStage).toBe('Ideas');
  });

  it('refuses when the slug collides with an existing entry', async () => {
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f20', 'taken'));
    await expect(createGroup(projectRoot, {
      slug: 'taken',
      title: 'Taken',
      lane: 'default',
    })).rejects.toThrow(/slug collision/);
  });

  it('refuses an empty slug', async () => {
    await expect(createGroup(projectRoot, {
      slug: '',
      title: 'x',
      lane: 'default',
    })).rejects.toThrow(/slug must be a non-empty string/);
  });

  it('refuses an empty title', async () => {
    await expect(createGroup(projectRoot, {
      slug: 'x',
      title: '   ',
      lane: 'default',
    })).rejects.toThrow(/title must be a non-empty string/);
  });

  it('refuses an unknown lane', async () => {
    await expect(createGroup(projectRoot, {
      slug: 'x',
      title: 'X',
      lane: 'no-such-lane',
    })).rejects.toThrow(/Lane config "no-such-lane" not found/);
  });

  it('binds artifactPath when supplied', async () => {
    const result = await createGroup(projectRoot, {
      slug: 'with-art',
      title: 'With Artifact',
      lane: 'default',
      artifactPath: 'docs/with-art.md',
    });
    expect(result.entry.artifactPath).toBe('docs/with-art.md');
  });
});

describe('listGroups + showGroup', () => {
  it('listGroups returns empty when no entries exist', async () => {
    const groups = await listGroups(projectRoot);
    expect(groups).toEqual([]);
  });

  it('listGroups filters to entries with non-empty members[]', async () => {
    const m = '550e8400-e29b-41d4-a716-446655440f30';
    await writeSidecar(projectRoot, makeEntry(m, 'mem'));
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f31', 'regular'));
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f32', 'empty-shell', { members: [] }));
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f33', 'real-group', { members: [m] }));

    const groups = await listGroups(projectRoot);
    expect(groups).toHaveLength(1);
    expect(groups[0].entry.slug).toBe('real-group');
    expect(groups[0].memberCount).toBe(1);
  });

  it('listGroups respects includeArchived', async () => {
    const m = '550e8400-e29b-41d4-a716-446655440f40';
    await writeSidecar(projectRoot, makeEntry(m, 'mem-2'));
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f41', 'active', { members: [m] }));
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f42', 'old', {
      members: [m],
      archivedAt: '2026-05-28T10:00:00.000Z',
    }));

    const active = await listGroups(projectRoot);
    expect(active.map((g) => g.entry.slug)).toEqual(['active']);

    const all = await listGroups(projectRoot, { includeArchived: true });
    expect(all.map((g) => g.entry.slug)).toEqual(['active', 'old']);
  });

  it('showGroup enriches each member with slug + lane + currentStage', async () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440f50';
    const m2 = '550e8400-e29b-41d4-a716-446655440f51';
    await writeSidecar(projectRoot, makeEntry(m1, 'm1', { currentStage: 'Drafting' }));
    await writeSidecar(projectRoot, makeEntry(m2, 'm2', { currentStage: 'Outlining' }));
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f52', 'g', { members: [m1, m2] }));

    const result = await showGroup(projectRoot, 'g');
    expect(result.members).toHaveLength(2);
    expect(result.members[0]).toMatchObject({
      uuid: m1,
      slug: 'm1',
      currentStage: 'Drafting',
      missing: false,
    });
  });

  it('showGroup surfaces missing members with missing: true', async () => {
    const present = '550e8400-e29b-41d4-a716-446655440f60';
    const absent = '550e8400-e29b-41d4-a716-446655440f99';
    await writeSidecar(projectRoot, makeEntry(present, 'present'));
    await writeSidecar(projectRoot, makeEntry('550e8400-e29b-41d4-a716-446655440f61', 'g', { members: [present, absent] }));

    const result = await showGroup(projectRoot, 'g');
    expect(result.members[1]).toMatchObject({ uuid: absent, missing: true });
    expect(result.members[1].slug).toBeUndefined();
  });
});

describe('addGroupMember + removeGroupMember', () => {
  async function makeGroupWith(memberUuids: string[]): Promise<string> {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440f70';
    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g', { members: memberUuids }));
    return groupUuid;
  }

  it('appends a member by default', async () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440f71';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm'));
    await makeGroupWith([]);

    const result = await addGroupMember(projectRoot, {
      groupSlugOrUuid: 'g',
      memberSlugOrUuid: 'm',
    });
    expect(result.index).toBe(0);
    expect(result.members).toEqual([memberUuid]);
  });

  it('inserts at --at <index>', async () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440f72';
    const m2 = '550e8400-e29b-41d4-a716-446655440f73';
    const m3 = '550e8400-e29b-41d4-a716-446655440f74';
    await writeSidecar(projectRoot, makeEntry(m1, 'm1'));
    await writeSidecar(projectRoot, makeEntry(m2, 'm2'));
    await writeSidecar(projectRoot, makeEntry(m3, 'm3'));
    await makeGroupWith([m1, m3]);

    const result = await addGroupMember(projectRoot, {
      groupSlugOrUuid: 'g',
      memberSlugOrUuid: 'm2',
      at: 1,
    });
    expect(result.members).toEqual([m1, m2, m3]);
  });

  it('refuses duplicates within a single group', async () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440f80';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-dup'));
    await makeGroupWith([memberUuid]);

    await expect(addGroupMember(projectRoot, {
      groupSlugOrUuid: 'g',
      memberSlugOrUuid: 'm-dup',
    })).rejects.toThrow(/already in this group/);
  });

  it('refuses self-membership', async () => {
    const groupUuid = await makeGroupWith([]);
    await expect(addGroupMember(projectRoot, {
      groupSlugOrUuid: 'g',
      memberSlugOrUuid: groupUuid,
    })).rejects.toThrow(/refused self-membership/);
  });

  it('refuses out-of-range --at', async () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440f90';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-oor'));
    await makeGroupWith([]);
    await expect(addGroupMember(projectRoot, {
      groupSlugOrUuid: 'g',
      memberSlugOrUuid: 'm-oor',
      at: 5,
    })).rejects.toThrow(/out of range/);
  });

  it('removeGroupMember removes the member', async () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440fa0';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-remove'));
    await makeGroupWith([memberUuid]);

    const result = await removeGroupMember(projectRoot, {
      groupSlugOrUuid: 'g',
      memberSlugOrUuid: 'm-remove',
    });
    expect(result.members).toEqual([]);
  });

  it('removeGroupMember refuses when the member is not present', async () => {
    const memberA = '550e8400-e29b-41d4-a716-446655440fb0';
    const memberB = '550e8400-e29b-41d4-a716-446655440fb1';
    await writeSidecar(projectRoot, makeEntry(memberA, 'in-grp'));
    await writeSidecar(projectRoot, makeEntry(memberB, 'not-in-grp'));
    await makeGroupWith([memberA]);

    await expect(removeGroupMember(projectRoot, {
      groupSlugOrUuid: 'g',
      memberSlugOrUuid: 'not-in-grp',
    })).rejects.toThrow(/not in this group/);
  });
});

describe('updateGroup', () => {
  it('mutates title', async () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440fc0';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440fc1';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-u'));
    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-u', {
      title: 'Old',
      members: [memberUuid],
    }));

    const result = await updateGroup(projectRoot, {
      slugOrUuid: 'g-u',
      title: 'New',
    });
    expect(result.entry.title).toBe('New');
    expect(result.changedFields).toEqual(['title']);
  });

  it('refuses when no patch fields are supplied', async () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440fc2';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440fc3';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-u2'));
    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-u2', { members: [memberUuid] }));

    await expect(updateGroup(projectRoot, { slugOrUuid: 'g-u2' }))
      .rejects.toThrow(/no patch fields supplied/);
  });
});

describe('archiveGroup + restoreGroup', () => {
  async function makeGroupForArchive(archived = false): Promise<string> {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440fd0';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440fd1';
    await writeSidecar(projectRoot, makeEntry(memberUuid, 'm-arc'));
    await writeSidecar(projectRoot, makeEntry(groupUuid, 'g-arc', {
      members: [memberUuid],
      ...(archived && { archivedAt: '2026-05-28T10:00:00.000Z' }),
    }));
    return groupUuid;
  }

  it('archiveGroup sets archivedAt', async () => {
    await makeGroupForArchive();
    const result = await archiveGroup(projectRoot, 'g-arc');
    expect(typeof result.entry.archivedAt).toBe('string');
    expect(result.entry.archivedAt?.length ?? 0).toBeGreaterThan(0);
  });

  it('archiveGroup refuses an already-archived group', async () => {
    await makeGroupForArchive(true);
    await expect(archiveGroup(projectRoot, 'g-arc'))
      .rejects.toThrow(/already archived/);
  });

  it('restoreGroup clears archivedAt', async () => {
    await makeGroupForArchive(true);
    const result = await restoreGroup(projectRoot, 'g-arc');
    expect(result.entry.archivedAt).toBeUndefined();
  });

  it('restoreGroup refuses a non-archived group', async () => {
    await makeGroupForArchive();
    await expect(restoreGroup(projectRoot, 'g-arc'))
      .rejects.toThrow(/not archived/);
  });
});
