/**
 * deskwork CLI `group list` verb.
 *
 * Phase 7 Task 7.2 (graphical-entries). Verifies the "non-empty
 * members[] => group" filter, the archived-default exclusion, and
 * the `--include-archived` opt-in.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  assertDeskworkBinPresent,
  destroyProject,
  group,
  makeProject,
  writeSidecar,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork group list', () => {
  it('emits an empty array when no groups exist', () => {
    const res = group(project, 'list');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { groups: unknown[] };
    expect(parsed.groups).toEqual([]);
  });

  it('skips entries without a members field', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440001', 'regular');
    const res = group(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { groups: unknown[] };
    expect(parsed.groups).toEqual([]);
  });

  it('includes empty-members groups (members: [] is the declared-empty marker, not a regular entry)', () => {
    // Per the Task 7.2 review action superseding AUDIT-20260529-13:
    // an entry with `members: []` IS a group (just not populated yet)
    // — `group create` writes this shape so the dashboard surfaces
    // the new group immediately. `members: undefined` denotes a
    // regular entry, which IS correctly filtered out by `list`.
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440002', 'empty-group', {
      members: [],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440003', 'regular-entry');
    const res = group(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      groups: Array<{ slug: string; memberCount: number }>;
    };
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]).toMatchObject({ slug: 'empty-group', memberCount: 0 });
  });

  it('emits groups whose members[] is non-empty', () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440010';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440011';
    writeSidecar(project, memberUuid, 'member-1');
    writeSidecar(project, groupUuid, 'my-group', {
      title: 'My Group',
      members: [memberUuid],
    });
    const res = group(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      groups: Array<{ slug: string; title: string; memberCount: number; archived: boolean }>;
    };
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]).toMatchObject({
      slug: 'my-group',
      title: 'My Group',
      memberCount: 1,
      archived: false,
    });
  });

  it('sorts groups alphabetically by slug', () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440020';
    writeSidecar(project, memberUuid, 'member-x');
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440021', 'zebra', {
      members: [memberUuid],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440022', 'apple', {
      members: [memberUuid],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440023', 'mango', {
      members: [memberUuid],
    });

    const res = group(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { groups: Array<{ slug: string }> };
    expect(parsed.groups.map((g) => g.slug)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('excludes archived groups by default', () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440030';
    writeSidecar(project, memberUuid, 'member-a');
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440031', 'active-group', {
      members: [memberUuid],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440032', 'archived-group', {
      members: [memberUuid],
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = group(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { groups: Array<{ slug: string }> };
    expect(parsed.groups.map((g) => g.slug)).toEqual(['active-group']);
  });

  it('includes archived groups when --include-archived is passed', () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440040';
    writeSidecar(project, memberUuid, 'member-b');
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440041', 'active-group-2', {
      members: [memberUuid],
    });
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440042', 'archived-group-2', {
      members: [memberUuid],
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = group(project, 'list', '--include-archived');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      groups: Array<{ slug: string; archived: boolean; archivedAt?: string }>;
    };
    expect(parsed.groups.map((g) => g.slug)).toEqual([
      'active-group-2',
      'archived-group-2',
    ]);
    const archived = parsed.groups.find((g) => g.slug === 'archived-group-2');
    expect(archived).toBeDefined();
    expect(archived?.archived).toBe(true);
    expect(archived?.archivedAt).toBe('2026-05-28T10:00:00.000Z');
  });
});

describe('deskwork group (generic)', () => {
  it('prints usage when no verb is supplied', () => {
    const res = group(project);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork group/);
  });

  it('prints an unknown-verb error', () => {
    const res = group(project, 'wat');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Unknown group verb: wat/);
  });
});
