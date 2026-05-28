/**
 * deskwork CLI `lane` — update / archive / restore / purge verbs.
 *
 * Phase 6 Task 6.1 (graphical-entries). Mutation verbs that don't
 * relocate entries; the move verb (which DOES touch entries) lives
 * in `move.test.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  destroyProject,
  lane,
  makeProject,
  readLaneJson,
  writeLaneJson,
  writeSidecar,
} from './helpers.ts';

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork lane update', () => {
  beforeEach(() => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
  });

  it('mutates --name in place', () => {
    const res = lane(project, 'update', 'default', '--name', 'Primary');
    expect(res.code).toBe(0);
    expect(readLaneJson(project, 'default')['name']).toBe('Primary');
  });

  it('mutates --content-dir in place', () => {
    const res = lane(project, 'update', 'default', '--content-dir', 'content');
    expect(res.code).toBe(0);
    expect(readLaneJson(project, 'default')['contentDir']).toBe('content');
  });

  it('cross-validates --template before committing', () => {
    const res = lane(project, 'update', 'default', '--template', 'does-not-exist');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/does not resolve|not found/);
    expect(readLaneJson(project, 'default')['pipelineTemplate']).toBe('editorial');
  });

  it('refuses when no patch flags are passed', () => {
    const res = lane(project, 'update', 'default');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/no patch fields supplied/);
  });

  it('reports changedFields on success', () => {
    const res = lane(
      project,
      'update', 'default',
      '--name', 'Primary',
      '--content-dir', 'content',
    );
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { changedFields: string[] };
    expect(parsed.changedFields.sort()).toEqual(['contentDir', 'name']);
  });
});

describe('deskwork lane archive / restore', () => {
  beforeEach(() => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
  });

  it('sets archivedAt on archive', () => {
    const res = lane(project, 'archive', 'default');
    expect(res.code).toBe(0);
    const archivedAt = readLaneJson(project, 'default')['archivedAt'];
    expect(typeof archivedAt).toBe('string');
    expect(archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses to archive a lane that is already archived', () => {
    lane(project, 'archive', 'default');
    const res = lane(project, 'archive', 'default');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already archived/);
  });

  it('clears archivedAt on restore', () => {
    lane(project, 'archive', 'default');
    const res = lane(project, 'restore', 'default');
    expect(res.code).toBe(0);
    expect(readLaneJson(project, 'default')['archivedAt']).toBeUndefined();
  });

  it('refuses to restore a lane that is not archived', () => {
    const res = lane(project, 'restore', 'default');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not archived/);
  });
});

describe('deskwork lane purge', () => {
  beforeEach(() => {
    writeLaneJson(project, 'mockups', {
      id: 'mockups',
      name: 'Mockups',
      pipelineTemplate: 'editorial',
      contentDir: 'src/mockups',
    });
  });

  it('deletes the JSON when no entries reference the lane', () => {
    const res = lane(project, 'purge', 'mockups');
    expect(res.code).toBe(0);
    expect(
      existsSync(join(project, '.deskwork', 'lanes', 'mockups.json')),
    ).toBe(false);
  });

  it('refuses when entries reference the lane', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    writeSidecar(project, uuid, 'a-post', {
      lane: 'mockups',
      currentStage: 'Drafting',
    });

    const res = lane(project, 'purge', 'mockups');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/1 entry references it.*a-post/);
    expect(
      existsSync(join(project, '.deskwork', 'lanes', 'mockups.json')),
    ).toBe(true);
  });

  it('lists the first 5 dependent slugs with a +N more suffix', () => {
    for (let i = 0; i < 7; i++) {
      const uuid = `550e8400-e29b-41d4-a716-44665544000${i}`;
      writeSidecar(project, uuid, `slug-${i}`, {
        lane: 'mockups',
        currentStage: 'Drafting',
      });
    }
    const res = lane(project, 'purge', 'mockups');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/\+2 more/);
  });

  it('refuses when the lane does not exist', () => {
    const res = lane(project, 'purge', 'nope');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Lane config "nope" not found/);
  });
});
