/**
 * deskwork CLI `lane` — list / show / create verbs.
 *
 * Phase 6 Task 6.1 (graphical-entries). Read-side and creation
 * verbs. Mutation verbs (update / archive / restore / purge) live
 * in `update-archive-purge.test.ts`; the move verb lives in
 * `move.test.ts`.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertDeskworkBinPresent,
  destroyProject,
  lane,
  makeProject,
  readLaneJson,
  writeLaneJson,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork lane list', () => {
  it('emits an empty array when no lane configs exist', () => {
    const res = lane(project, 'list');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { lanes: unknown[] };
    expect(parsed.lanes).toEqual([]);
  });

  it('emits active lanes with id / name / pipelineTemplate / contentDir', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const res = lane(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      lanes: Array<{
        id: string;
        name: string;
        pipelineTemplate: string;
        archived: boolean;
      }>;
    };
    expect(parsed.lanes).toHaveLength(1);
    expect(parsed.lanes[0]).toMatchObject({
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      archived: false,
    });
  });

  it('excludes archived lanes by default', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    writeLaneJson(project, 'stale', {
      id: 'stale',
      name: 'Stale',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = lane(project, 'list');
    const parsed = JSON.parse(res.stdout) as { lanes: Array<{ id: string }> };
    expect(parsed.lanes.map((l) => l.id)).toEqual(['default']);
  });

  it('includes archived lanes when --include-archived is passed', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    writeLaneJson(project, 'stale', {
      id: 'stale',
      name: 'Stale',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = lane(project, 'list', '--include-archived');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      lanes: Array<{ id: string; archived: boolean }>;
    };
    expect(parsed.lanes.map((l) => l.id)).toEqual(['default', 'stale']);
    expect(parsed.lanes[1].archived).toBe(true);
  });

  it('surfaces healthy lanes plus a malformed section when one config is corrupt (AUDIT-20260530-57)', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    writeLaneJson(project, 'mockups', {
      id: 'mockups',
      name: 'Mockups',
      pipelineTemplate: 'editorial',
      contentDir: 'src/mockups',
    });
    // Write a malformed lane JSON directly (bypassing writeLaneJson's
    // JSON.stringify), so the enumeration includes it but loadLaneConfig
    // would throw.
    const lanesDir = join(project, '.deskwork', 'lanes');
    mkdirSync(lanesDir, { recursive: true });
    writeFileSync(join(lanesDir, 'broken.json'), '{ not json', 'utf-8');

    const res = lane(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      lanes: Array<{ id: string }>;
      malformed: Array<{ id: string; error: string }>;
    };
    expect(parsed.lanes.map((l) => l.id).sort()).toEqual(['default', 'mockups']);
    expect(parsed.malformed).toHaveLength(1);
    expect(parsed.malformed[0].id).toBe('broken');
  });
});

describe('deskwork lane show', () => {
  it('emits a single lane config when found', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const res = lane(project, 'show', 'default');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { id: string; archived: boolean };
    expect(parsed.id).toBe('default');
    expect(parsed.archived).toBe(false);
  });

  it('emits archivedAt when the lane is archived', () => {
    writeLaneJson(project, 'stale', {
      id: 'stale',
      name: 'Stale',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
      archivedAt: '2026-05-28T10:00:00.000Z',
    });
    const res = lane(project, 'show', 'stale');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      archived: boolean;
      archivedAt?: string;
    };
    expect(parsed.archived).toBe(true);
    expect(parsed.archivedAt).toBe('2026-05-28T10:00:00.000Z');
  });

  it('refuses with a clear error when the lane does not exist', () => {
    const res = lane(project, 'show', 'nope');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Lane config "nope" not found/);
  });

  it('refuses when the id positional is missing', () => {
    const res = lane(project, 'show');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork lane/);
  });
});

describe('deskwork lane create', () => {
  it('writes a new lane config bound to the editorial preset', () => {
    const res = lane(
      project,
      'create', 'mockups',
      '--template', 'editorial',
      '--content-dir', 'src/mockups',
      '--name', 'Mockups',
    );
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { created: boolean; id: string };
    expect(parsed.created).toBe(true);
    expect(parsed.id).toBe('mockups');

    const onDisk = readLaneJson(project, 'mockups');
    expect(onDisk['id']).toBe('mockups');
    expect(onDisk['name']).toBe('Mockups');
    expect(onDisk['contentDir']).toBe('src/mockups');
  });

  it('defaults --name to the id when omitted', () => {
    const res = lane(
      project,
      'create', 'mockups',
      '--template', 'editorial',
      '--content-dir', 'src/mockups',
    );
    expect(res.code).toBe(0);
    const onDisk = readLaneJson(project, 'mockups');
    expect(onDisk['name']).toBe('mockups');
  });

  it('refuses when the file already exists', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    });
    const res = lane(
      project,
      'create', 'default',
      '--template', 'editorial',
      '--content-dir', 'docs',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/file already exists/);
  });

  it('refuses when the pipeline template does not resolve', () => {
    const res = lane(
      project,
      'create', 'mockups',
      '--template', 'no-such-template',
      '--content-dir', 'src/mockups',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/does not resolve|not found/);
  });

  it('refuses when --template is missing', () => {
    const res = lane(project, 'create', 'mockups', '--content-dir', 'src/mockups');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Missing required flag --template/);
  });

  it('refuses when --content-dir is missing', () => {
    const res = lane(project, 'create', 'mockups', '--template', 'editorial');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Missing required flag --content-dir/);
  });

  it('refuses lane ids that fail the kebab-case charset', () => {
    const res = lane(
      project,
      'create', 'UPPER',
      '--template', 'editorial',
      '--content-dir', 'docs',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid lane id/);
  });

  it('refuses lane ids with whitespace', () => {
    const res = lane(
      project,
      'create', 'with space',
      '--template', 'editorial',
      '--content-dir', 'docs',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid lane id/);
  });

  it('refuses lane ids that look like path-traversal', () => {
    const res = lane(
      project,
      'create', '../../etc/foo',
      '--template', 'editorial',
      '--content-dir', 'docs',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid lane id/);
  });

  it('refuses --content-dir that resolves outside the project root', () => {
    const res = lane(
      project,
      'create', 'mockups',
      '--template', 'editorial',
      '--content-dir', '../../tmp/foo',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid contentDir/);
  });
});

describe('deskwork lane (generic)', () => {
  it('prints usage when no verb is supplied', () => {
    const res = lane(project);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork lane/);
  });

  it('prints an unknown-verb error', () => {
    const res = lane(project, 'nope');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Unknown lane verb: nope/);
  });
});
