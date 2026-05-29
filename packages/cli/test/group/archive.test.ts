/**
 * deskwork CLI `group archive` + `group restore` verbs.
 *
 * Phase 7 Task 7.2 (graphical-entries). Verifies the soft-archive
 * shape (`archivedAt` set / cleared), the already-archived /
 * not-archived refusals, and the not-a-group refusal.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  assertDeskworkBinPresent,
  destroyProject,
  group,
  listJournalEvents,
  makeProject,
  readSidecar,
  writeSidecar,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork group archive', () => {
  function fixture(): { groupUuid: string } {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440601';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440602';
    writeSidecar(project, memberUuid, 'a-member');
    writeSidecar(project, groupUuid, 'arch-target', { members: [memberUuid] });
    return { groupUuid };
  }

  it('sets archivedAt on archive', () => {
    const { groupUuid } = fixture();
    const res = group(project, 'archive', 'arch-target');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      archived: boolean;
      archivedAt: string;
    };
    expect(parsed.archived).toBe(true);
    expect(parsed.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const onDisk = readSidecar(project, groupUuid)['archivedAt'];
    expect(typeof onDisk).toBe('string');
  });

  it('emits a group-archive journal event', () => {
    fixture();
    group(project, 'archive', 'arch-target');
    const events = listJournalEvents(project);
    const archives = events.filter((e) => e['kind'] === 'group-archive');
    expect(archives).toHaveLength(1);
    expect((archives[0]['details'] as Record<string, unknown>)['archivedAt'])
      .toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses already-archived groups', () => {
    fixture();
    const first = group(project, 'archive', 'arch-target');
    expect(first.code).toBe(0);
    const second = group(project, 'archive', 'arch-target');
    expect(second.code).not.toBe(0);
    expect(second.stderr).toMatch(/already archived/);
  });

  it('refuses against a non-group entry', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440611', 'regular');
    const res = group(project, 'archive', 'regular');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/entry has no `members` field/);
  });

  it('refuses when the slug positional is missing', () => {
    const res = group(project, 'archive');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork group/);
  });
});

describe('deskwork group restore', () => {
  function fixture(): { groupUuid: string } {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440621';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440622';
    writeSidecar(project, memberUuid, 'a-member-2');
    writeSidecar(project, groupUuid, 'rest-target', {
      members: [memberUuid],
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    return { groupUuid };
  }

  it('clears archivedAt on restore', () => {
    const { groupUuid } = fixture();
    const res = group(project, 'restore', 'rest-target');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { restored: boolean; slug: string };
    expect(parsed.restored).toBe(true);
    expect(parsed.slug).toBe('rest-target');
    expect(readSidecar(project, groupUuid)['archivedAt']).toBeUndefined();
  });

  it('emits a group-restore journal event', () => {
    fixture();
    group(project, 'restore', 'rest-target');
    const events = listJournalEvents(project);
    const restores = events.filter((e) => e['kind'] === 'group-restore');
    expect(restores).toHaveLength(1);
  });

  it('refuses non-archived groups', () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440631';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440632';
    writeSidecar(project, memberUuid, 'm-restore');
    writeSidecar(project, groupUuid, 'active-group', { members: [memberUuid] });
    const res = group(project, 'restore', 'active-group');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not archived/);
  });

  it('refuses against a non-group entry', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440641', 'plain', {
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = group(project, 'restore', 'plain');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/entry has no `members` field/);
  });
});
