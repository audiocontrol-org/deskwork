/**
 * deskwork CLI `group show` verb.
 *
 * Phase 7 Task 7.2 (graphical-entries). Verifies per-member
 * enrichment (slug / lane / currentStage), missing-member
 * surfacing, and the not-a-group refusal.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  addLane,
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

describe('deskwork group show', () => {
  it('emits the group + enriched members', () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440101';
    const m2 = '550e8400-e29b-41d4-a716-446655440102';
    const g = '550e8400-e29b-41d4-a716-446655440103';
    writeSidecar(project, m1, 'member-one', { currentStage: 'Drafting' });
    writeSidecar(project, m2, 'member-two', { currentStage: 'Outlining' });
    writeSidecar(project, g, 'my-group', {
      title: 'My Group',
      members: [m1, m2],
    });

    const res = group(project, 'show', 'my-group');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      slug: string;
      title: string;
      memberCount: number;
      members: Array<{
        uuid: string;
        slug?: string;
        currentStage?: string;
        missing: boolean;
      }>;
    };
    expect(parsed.slug).toBe('my-group');
    expect(parsed.title).toBe('My Group');
    expect(parsed.memberCount).toBe(2);
    expect(parsed.members).toHaveLength(2);
    expect(parsed.members[0]).toMatchObject({
      uuid: m1,
      slug: 'member-one',
      currentStage: 'Drafting',
      missing: false,
    });
    expect(parsed.members[1]).toMatchObject({
      uuid: m2,
      slug: 'member-two',
      currentStage: 'Outlining',
      missing: false,
    });
  });

  it('resolves a UUID positional', () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440111';
    const g = '550e8400-e29b-41d4-a716-446655440112';
    writeSidecar(project, m1, 'member-3');
    writeSidecar(project, g, 'g-uuid', { members: [m1] });
    const res = group(project, 'show', g);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { uuid: string; slug: string };
    expect(parsed.uuid).toBe(g);
    expect(parsed.slug).toBe('g-uuid');
  });

  it('emits archived state on archived groups', () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440121';
    const g = '550e8400-e29b-41d4-a716-446655440122';
    writeSidecar(project, m1, 'member-a');
    writeSidecar(project, g, 'archived-group', {
      members: [m1],
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = group(project, 'show', 'archived-group');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      archived: boolean;
      archivedAt?: string;
    };
    expect(parsed.archived).toBe(true);
    expect(parsed.archivedAt).toBe('2026-05-28T10:00:00.000Z');
  });

  it('reports missing members with missing: true', () => {
    const m1 = '550e8400-e29b-41d4-a716-446655440131';
    const missing = '550e8400-e29b-41d4-a716-446655440199';
    const g = '550e8400-e29b-41d4-a716-446655440132';
    writeSidecar(project, m1, 'present-member');
    // missing UUID intentionally NOT written to disk
    writeSidecar(project, g, 'dangling-group', { members: [m1, missing] });

    const res = group(project, 'show', 'dangling-group');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      members: Array<{ uuid: string; missing: boolean; slug?: string }>;
    };
    expect(parsed.members).toHaveLength(2);
    expect(parsed.members[0]).toMatchObject({ uuid: m1, missing: false, slug: 'present-member' });
    expect(parsed.members[1]).toMatchObject({ uuid: missing, missing: true });
    expect(parsed.members[1].slug).toBeUndefined();
  });

  it('enriches members in different lanes (cross-lane membership)', () => {
    addLane(project, 'mockups');
    const m1 = '550e8400-e29b-41d4-a716-446655440141';
    const m2 = '550e8400-e29b-41d4-a716-446655440142';
    const g = '550e8400-e29b-41d4-a716-446655440143';
    writeSidecar(project, m1, 'm-default-lane', { lane: 'default' });
    writeSidecar(project, m2, 'm-mockups-lane', { lane: 'mockups' });
    writeSidecar(project, g, 'cross-lane-group', {
      lane: 'default',
      members: [m1, m2],
    });

    const res = group(project, 'show', 'cross-lane-group');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      members: Array<{ slug?: string; lane?: string }>;
    };
    expect(parsed.members).toHaveLength(2);
    expect(parsed.members[0]).toMatchObject({ slug: 'm-default-lane', lane: 'default' });
    expect(parsed.members[1]).toMatchObject({ slug: 'm-mockups-lane', lane: 'mockups' });
  });

  it('refuses against a non-group entry', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440151', 'regular');
    const res = group(project, 'show', 'regular');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/has no members/);
  });

  it('refuses against an entry with empty members[]', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440152', 'empty-shell', {
      members: [],
    });
    const res = group(project, 'show', 'empty-shell');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/has no members/);
  });

  it('refuses when the slug positional is missing', () => {
    const res = group(project, 'show');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork group/);
  });

  it('refuses when the slug does not resolve', () => {
    const res = group(project, 'show', 'no-such-slug');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/'no-such-slug' not found/);
  });
});
