/**
 * deskwork CLI `group create` verb.
 *
 * Phase 7 Task 7.2 (graphical-entries). Verifies the new-group
 * sidecar shape (members: [] intent-marker, lane binding, default
 * stage), slug-collision refusal, archived-lane refusal, and
 * missing-flag refusals.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  addLane,
  assertDeskworkBinPresent,
  destroyProject,
  group,
  listJournalEvents,
  listSidecarUuids,
  makeProject,
  readSidecar,
  writeSidecar,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork group create', () => {
  it('writes a new group sidecar with members: []', () => {
    const before = listSidecarUuids(project);
    const res = group(project, 'create', 'my-new-group', '--lane', 'default');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      created: boolean;
      slug: string;
      lane: string;
      currentStage: string;
      members: string[];
    };
    expect(parsed.created).toBe(true);
    expect(parsed.slug).toBe('my-new-group');
    expect(parsed.lane).toBe('default');
    expect(parsed.currentStage).toBe('Ideas'); // editorial preset's first linearStage
    expect(parsed.members).toEqual([]);

    const after = listSidecarUuids(project);
    expect(after.length).toBe(before.length + 1);

    // Find the new sidecar and verify the on-disk shape.
    const newUuids = after.filter((u) => !before.includes(u));
    expect(newUuids).toHaveLength(1);
    const sidecar = readSidecar(project, newUuids[0]);
    expect(sidecar['slug']).toBe('my-new-group');
    expect(sidecar['members']).toEqual([]);
    expect(sidecar['lane']).toBe('default');
  });

  it('defaults --title to the slug when omitted', () => {
    const res = group(project, 'create', 'untitled-group', '--lane', 'default');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { title: string };
    expect(parsed.title).toBe('untitled-group');
  });

  it('uses --title when supplied', () => {
    const res = group(
      project,
      'create', 'titled-group',
      '--lane', 'default',
      '--title', 'A Nice Title',
    );
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { title: string };
    expect(parsed.title).toBe('A Nice Title');
  });

  it('binds --artifact-path on the new entry', () => {
    const res = group(
      project,
      'create', 'with-artifact',
      '--lane', 'default',
      '--artifact-path', 'docs/with-artifact.md',
    );
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { artifactPath?: string };
    expect(parsed.artifactPath).toBe('docs/with-artifact.md');
  });

  it('emits a group-create journal event', () => {
    group(project, 'create', 'event-group', '--lane', 'default');
    const events = listJournalEvents(project);
    const created = events.filter((e) => e['kind'] === 'group-create');
    expect(created).toHaveLength(1);
    expect((created[0]['details'] as Record<string, unknown>)['slug'])
      .toBe('event-group');
  });

  it('refuses when the slug already exists', () => {
    writeSidecar(project, '550e8400-e29b-41d4-a716-446655440201', 'collide');
    const res = group(project, 'create', 'collide', '--lane', 'default');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/slug collision/);
  });

  it('refuses when --lane is missing', () => {
    const res = group(project, 'create', 'no-lane');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Missing required flag --lane/);
  });

  it('refuses when the lane does not exist', () => {
    const res = group(
      project,
      'create', 'phantom-lane-group',
      '--lane', 'no-such-lane',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Lane config "no-such-lane" not found/);
  });

  it('refuses when the lane is archived', () => {
    addLane(project, 'archived-lane', {
      contentDir: 'docs-archived',
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = group(
      project,
      'create', 'into-archived',
      '--lane', 'archived-lane',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/archived lane "archived-lane"/);
  });

  it('refuses when the slug positional is missing', () => {
    const res = group(project, 'create', '--lane', 'default');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork group/);
  });
});
