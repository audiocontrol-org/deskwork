/**
 * deskwork CLI `group update` verb.
 *
 * Phase 7 Task 7.2 (graphical-entries). Verifies the --title patch
 * + the require-at-least-one-patch refusal + the not-a-group
 * refusal.
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

describe('deskwork group update', () => {
  function makeGroup(): { groupUuid: string; memberUuid: string } {
    const memberUuid = '550e8400-e29b-41d4-a716-446655440301';
    const groupUuid = '550e8400-e29b-41d4-a716-446655440302';
    writeSidecar(project, memberUuid, 'a-member');
    writeSidecar(project, groupUuid, 'updatable-group', {
      title: 'Old Title',
      members: [memberUuid],
    });
    return { groupUuid, memberUuid };
  }

  it('mutates --title in place', () => {
    const { groupUuid } = makeGroup();
    const res = group(project, 'update', 'updatable-group', '--title', 'New Title');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      title: string;
      changedFields: string[];
    };
    expect(parsed.title).toBe('New Title');
    expect(parsed.changedFields).toEqual(['title']);

    const sidecar = readSidecar(project, groupUuid);
    expect(sidecar['title']).toBe('New Title');
  });

  it('emits a group-update journal event', () => {
    makeGroup();
    group(project, 'update', 'updatable-group', '--title', 'Newer');
    const events = listJournalEvents(project);
    const updates = events.filter((e) => e['kind'] === 'group-update');
    expect(updates).toHaveLength(1);
    const details = updates[0]['details'] as Record<string, unknown>;
    expect(details['changedFields']).toEqual(['title']);
    expect((details['before'] as Record<string, unknown>)['title']).toBe('Old Title');
    expect((details['after'] as Record<string, unknown>)['title']).toBe('Newer');
  });

  it('refuses when no patch flags are supplied', () => {
    makeGroup();
    const res = group(project, 'update', 'updatable-group');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/no patch fields supplied/);
  });

  it('refuses --title with an empty string', () => {
    makeGroup();
    const res = group(project, 'update', 'updatable-group', '--title', '');
    // Empty string IS a value as far as parseArgs is concerned (the
    // missing-value check only fires when the next argv is undefined
    // or starts with --). The empty-string refusal lands at the
    // operation layer instead.
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--title must be a non-empty string/);
  });

  it('refuses --title with whitespace-only string', () => {
    makeGroup();
    const res = group(project, 'update', 'updatable-group', '--title', '   ');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--title must be a non-empty string/);
  });

  it('refuses against a non-group entry', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440310', 'plain');
    const res = group(project, 'update', 'plain', '--title', 'oops');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/has no members/);
  });

  it('refuses when the slug positional is missing', () => {
    const res = group(project, 'update', '--title', 'x');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork group/);
  });
});
