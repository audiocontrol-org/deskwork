/**
 * deskwork CLI `group add-member` verb.
 *
 * Phase 7 Task 7.2 (graphical-entries). Verifies append/insert
 * semantics, multi-group + cross-lane membership, duplicate
 * refusal, self-membership refusal, and out-of-range index
 * refusal.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  addLane,
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

describe('deskwork group add-member', () => {
  function fixture(): {
    groupUuid: string;
    memberA: string;
    memberB: string;
    memberC: string;
  } {
    const groupUuid = '550e8400-e29b-41d4-a716-446655440401';
    const memberA = '550e8400-e29b-41d4-a716-446655440411';
    const memberB = '550e8400-e29b-41d4-a716-446655440412';
    const memberC = '550e8400-e29b-41d4-a716-446655440413';
    writeSidecar(project, memberA, 'member-a');
    writeSidecar(project, memberB, 'member-b');
    writeSidecar(project, memberC, 'member-c');
    writeSidecar(project, groupUuid, 'g', { members: [] });
    return { groupUuid, memberA, memberB, memberC };
  }

  it('appends a member by default', () => {
    const { groupUuid, memberA } = fixture();
    const res = group(project, 'add-member', 'g', 'member-a');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      added: boolean;
      memberId: string;
      memberSlug: string;
      index: number;
      members: string[];
    };
    expect(parsed.added).toBe(true);
    expect(parsed.memberId).toBe(memberA);
    expect(parsed.memberSlug).toBe('member-a');
    expect(parsed.index).toBe(0);
    expect(parsed.members).toEqual([memberA]);
    expect((readSidecar(project, groupUuid)['members'] as unknown[]))
      .toEqual([memberA]);
  });

  it('preserves ordering across multiple appends', () => {
    const { memberA, memberB, memberC } = fixture();
    group(project, 'add-member', 'g', 'member-a');
    group(project, 'add-member', 'g', 'member-b');
    group(project, 'add-member', 'g', 'member-c');
    const show = group(project, 'show', 'g');
    const parsed = JSON.parse(show.stdout) as {
      members: Array<{ uuid: string }>;
    };
    expect(parsed.members.map((m) => m.uuid)).toEqual([memberA, memberB, memberC]);
  });

  it('inserts at --at <index>', () => {
    const { memberA, memberB, memberC } = fixture();
    group(project, 'add-member', 'g', 'member-a');
    group(project, 'add-member', 'g', 'member-c');
    const res = group(
      project,
      'add-member', 'g', 'member-b',
      '--at', '1',
    );
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      index: number;
      members: string[];
    };
    expect(parsed.index).toBe(1);
    expect(parsed.members).toEqual([memberA, memberB, memberC]);
  });

  it('accepts --at <members.length> as the explicit append position', () => {
    const { memberA, memberB } = fixture();
    group(project, 'add-member', 'g', 'member-a');
    const res = group(
      project,
      'add-member', 'g', 'member-b',
      '--at', '1',
    );
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { members: string[] };
    expect(parsed.members).toEqual([memberA, memberB]);
  });

  it('emits a group-add-member journal event with the index', () => {
    fixture();
    group(project, 'add-member', 'g', 'member-a');
    const events = listJournalEvents(project);
    const added = events.filter((e) => e['kind'] === 'group-add-member');
    expect(added).toHaveLength(1);
    const details = added[0]['details'] as Record<string, unknown>;
    expect(details['memberSlug']).toBe('member-a');
    expect(details['index']).toBe(0);
  });

  it('refuses --at <out-of-range>', () => {
    fixture();
    const res = group(
      project,
      'add-member', 'g', 'member-a',
      '--at', '5',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--at 5 is out of range/);
  });

  it('refuses --at <negative>', () => {
    fixture();
    const res = group(
      project,
      'add-member', 'g', 'member-a',
      '--at', '-1',
    );
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Invalid --at value/);
  });

  it('refuses --at <not-an-integer>', () => {
    fixture();
    const res = group(
      project,
      'add-member', 'g', 'member-a',
      '--at', '1.5',
    );
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Invalid --at value/);
  });

  it('refuses duplicates within the same group', () => {
    fixture();
    const first = group(project, 'add-member', 'g', 'member-a');
    expect(first.code).toBe(0);
    const second = group(project, 'add-member', 'g', 'member-a');
    expect(second.code).not.toBe(0);
    expect(second.stderr).toMatch(/already in this group/);
  });

  it('refuses self-membership', () => {
    const { groupUuid } = fixture();
    const res = group(project, 'add-member', 'g', groupUuid);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/refused self-membership/);
  });

  it('refuses against a non-group entry (no members field)', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440451', 'regular');
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440452', 'target');
    const res = group(project, 'add-member', 'regular', 'target');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/entry has no `members` field/);
  });

  it('refuses when the member does not resolve', () => {
    fixture();
    const res = group(project, 'add-member', 'g', 'no-such-slug');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/'no-such-slug' not found/);
  });

  // Step 7.2.4 — multi-group membership. An entry can be a member of
  // multiple groups simultaneously; the verb does NOT check for prior
  // membership in another group.
  it('supports multi-group membership (Step 7.2.4)', () => {
    const memberShared = '550e8400-e29b-41d4-a716-446655440461';
    const groupOne = '550e8400-e29b-41d4-a716-446655440462';
    const groupTwo = '550e8400-e29b-41d4-a716-446655440463';
    writeSidecar(project, memberShared, 'shared-member');
    writeSidecar(project, groupOne, 'group-one', { members: [] });
    writeSidecar(project, groupTwo, 'group-two', { members: [] });

    const r1 = group(project, 'add-member', 'group-one', 'shared-member');
    expect(r1.code).toBe(0);
    const r2 = group(project, 'add-member', 'group-two', 'shared-member');
    expect(r2.code).toBe(0);

    // Both groups now carry the same member UUID.
    expect((readSidecar(project, groupOne)['members'] as unknown[]))
      .toEqual([memberShared]);
    expect((readSidecar(project, groupTwo)['members'] as unknown[]))
      .toEqual([memberShared]);
  });

  // Step 7.2.5 — cross-lane membership. The verb does NOT check that
  // the member's `lane` matches the group's `lane`.
  it('supports cross-lane membership (Step 7.2.5) — member in another lane', () => {
    addLane(project, 'mockups');
    const memberDefault = '550e8400-e29b-41d4-a716-446655440471';
    const memberMockups = '550e8400-e29b-41d4-a716-446655440472';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440473';
    writeSidecar(project, memberDefault, 'm-default', { lane: 'default' });
    writeSidecar(project, memberMockups, 'm-mockups', { lane: 'mockups' });
    writeSidecar(project, groupUuid, 'cross-group', {
      lane: 'default',
      members: [],
    });

    const r1 = group(project, 'add-member', 'cross-group', 'm-default');
    expect(r1.code).toBe(0);
    const r2 = group(project, 'add-member', 'cross-group', 'm-mockups');
    expect(r2.code).toBe(0);

    const onDisk = readSidecar(project, groupUuid)['members'] as unknown[];
    expect(onDisk).toEqual([memberDefault, memberMockups]);
  });

  it('refuses when positionals are missing', () => {
    const res = group(project, 'add-member', 'only-one');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork group/);
  });
});
