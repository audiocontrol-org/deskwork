/**
 * deskwork CLI `group remove-member` verb.
 *
 * Phase 7 Task 7.2 (graphical-entries). Verifies removal, the
 * not-present refusal, and that removing a multi-group member from
 * one group does NOT affect membership in another group.
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

describe('deskwork group remove-member', () => {
  it('removes a present member', () => {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440501';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440502';
    writeSidecar(project, memberUuid, 'mem');
    writeSidecar(project, groupUuid, 'g', { members: [memberUuid] });

    const res = group(project, 'remove-member', 'g', 'mem');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      removed: boolean;
      memberSlug: string;
      members: string[];
    };
    expect(parsed.removed).toBe(true);
    expect(parsed.memberSlug).toBe('mem');
    expect(parsed.members).toEqual([]);
    expect((readSidecar(project, groupUuid)['members'] as unknown[])).toEqual([]);
  });

  it('preserves ordering of remaining members', () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440511';
    const m2 = '550e8400-e29b-41d4-a716-446655440512';
    const m3 = '550e8400-e29b-41d4-a716-446655440513';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440514';
    writeSidecar(project, m1, 'm-1');
    writeSidecar(project, m2, 'm-2');
    writeSidecar(project, m3, 'm-3');
    writeSidecar(project, groupUuid, 'g', { members: [m1, m2, m3] });

    const res = group(project, 'remove-member', 'g', 'm-2');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { members: string[] };
    expect(parsed.members).toEqual([m1, m3]);
  });

  it('emits a group-remove-member journal event', () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440521';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440522';
    writeSidecar(project, m1, 'm-event');
    writeSidecar(project, groupUuid, 'g', { members: [m1] });

    group(project, 'remove-member', 'g', 'm-event');
    const events = listJournalEvents(project);
    const removed = events.filter((e) => e['kind'] === 'group-remove-member');
    expect(removed).toHaveLength(1);
    const details = removed[0]['details'] as Record<string, unknown>;
    expect(details['memberSlug']).toBe('m-event');
    expect(details['membersAfter']).toEqual([]);
  });

  it('refuses when the member is not present', () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440531';
    const m2 = '550e8400-e29b-41d4-a716-446655440532';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440533';
    writeSidecar(project, m1, 'in-group');
    writeSidecar(project, m2, 'not-in-group');
    writeSidecar(project, groupUuid, 'g', { members: [m1] });

    const res = group(project, 'remove-member', 'g', 'not-in-group');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not in this group/);
  });

  it('refuses against a non-group entry', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440541', 'a');
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440542', 'b');
    const res = group(project, 'remove-member', 'a', 'b');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/entry has no `members` field/);
  });

  // Multi-group membership: removing from one group MUST NOT affect
  // the same UUID's membership in another group.
  it('removing from one group preserves membership in another (Step 7.2.4)', () => {
    const memberShared = '550e8400-e29b-41d4-a716-446655440551';
    const gOne = '550e8400-e29b-41d4-a716-446655440552';
    const gTwo = '550e8400-e29b-41d4-a716-446655440553';
    writeSidecar(project, memberShared, 'shared');
    writeSidecar(project, gOne, 'g-one', { members: [memberShared] });
    writeSidecar(project, gTwo, 'g-two', { members: [memberShared] });

    const res = group(project, 'remove-member', 'g-one', 'shared');
    expect(res.code).toBe(0);

    expect((readSidecar(project, gOne)['members'] as unknown[])).toEqual([]);
    // g-two STILL contains the member — independence preserved.
    expect((readSidecar(project, gTwo)['members'] as unknown[]))
      .toEqual([memberShared]);
  });

  it('refuses when positionals are missing', () => {
    const res = group(project, 'remove-member', 'only-one');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork group/);
  });
});
