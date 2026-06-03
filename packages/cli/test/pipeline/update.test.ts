/**
 * deskwork CLI `pipeline update` — five mutually-exclusive operations.
 *
 * Phase 6 Task 6.2 (graphical-entries). Covers happy paths for each
 * operation plus refusal modes (multi-flag, missing operation,
 * referenced-stage removal, plugin-preset refusal, schema violations).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  assertDeskworkBinPresent,
  destroyProject,
  makeProject,
  pipeline,
  pipelineRenamesExists,
  readPipelineOverride,
  readPipelineRenames,
  writeLaneJson,
  writePipelineOverride,
  writeSidecar,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => {
  project = makeProject();
  writePipelineOverride(project, 'my-blog', {
    id: 'my-blog',
    name: 'My Blog',
    description: 'Operator pipeline',
    linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
    offPipelineStages: ['Blocked', 'Cancelled'],
  });
});
afterEach(() => { destroyProject(project); });

describe('deskwork pipeline update --add-stage', () => {
  it('appends to linearStages by default', () => {
    const res = pipeline(
      project, 'update', 'my-blog', '--add-stage', 'Promoted',
    );
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['linearStages']).toEqual([
      'Idea', 'Drafting', 'Review', 'Live', 'Promoted',
    ]);
  });

  it('honors --position', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--add-stage', 'Outlined',
      '--position', '1',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['linearStages']).toEqual([
      'Idea', 'Outlined', 'Drafting', 'Review', 'Live',
    ]);
  });

  it('refuses when the stage already exists', () => {
    const res = pipeline(
      project, 'update', 'my-blog', '--add-stage', 'Drafting',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already exists/);
  });

  it('refuses an out-of-range --position', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--add-stage', 'New',
      '--position', '99',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/out of range/);
  });

  it('refuses --position values that are not non-negative integers', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--add-stage', 'New',
      '--position', '-1',
    );
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/non-negative integer/);
  });
});

describe('deskwork pipeline update --rename-stage', () => {
  it('renames in linearStages', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Drafting',
      '--to-stage', 'Writing',
    );
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['linearStages']).toEqual([
      'Idea', 'Writing', 'Review', 'Live',
    ]);
  });

  it('appends a {from, to, at} entry to <id>-renames.json', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Drafting',
      '--to-stage', 'Writing',
    );
    expect(res.code).toBe(0);
    expect(pipelineRenamesExists(project, 'my-blog')).toBe(true);
    const migration = readPipelineRenames(project, 'my-blog');
    expect(migration.pipelineId).toBe('my-blog');
    expect(migration.renames).toHaveLength(1);
    expect(migration.renames[0]).toMatchObject({
      from: 'Drafting',
      to: 'Writing',
    });
    expect(migration.renames[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('appends a second rename to the existing renames file', () => {
    pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Drafting',
      '--to-stage', 'Writing',
    );
    pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Review',
      '--to-stage', 'Editing',
    );
    const migration = readPipelineRenames(project, 'my-blog');
    expect(migration.renames).toHaveLength(2);
    expect(migration.renames[0].from).toBe('Drafting');
    expect(migration.renames[1].from).toBe('Review');
  });

  it('renames in offPipelineStages when the target lives there', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Blocked',
      '--to-stage', 'OnHold',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['offPipelineStages']).toEqual(['OnHold', 'Cancelled']);
  });

  it('refuses when <from> does not exist', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Nope',
      '--to-stage', 'Anything',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not found/);
  });

  it('refuses when <to> already exists', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Drafting',
      '--to-stage', 'Review',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already exists/);
  });

  it('refuses when --to-stage is omitted', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Drafting',
    );
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/--rename-stage requires --to-stage/);
  });

  // Reviewer-fix #8: cover lockedStages renaming. linearStages /
  // offPipelineStages already covered above; adding lockedStages
  // guards against a regression that drops the locked branch.
  it('renames in lockedStages alongside linearStages', () => {
    writePipelineOverride(project, 'locked-blog', {
      id: 'locked-blog',
      name: 'Locked Blog',
      description: 'x',
      linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
      lockedStages: ['Review'],
      offPipelineStages: [],
    });
    const res = pipeline(
      project, 'update', 'locked-blog',
      '--rename-stage', 'Review',
      '--to-stage', 'Editing',
    );
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'locked-blog');
    expect(onDisk['linearStages']).toEqual([
      'Idea', 'Drafting', 'Editing', 'Live',
    ]);
    expect(onDisk['lockedStages']).toEqual(['Editing']);
  });

  // Reviewer-fix #1 regression: after a rename, `pipeline list` must
  // continue to enumerate pipelines correctly — the migration sidecar
  // must NOT show up as a pipeline id. The original Phase 6 Task 6.2
  // shape co-located the sidecar with the templates and broke list.
  it('does not pollute the pipeline list with the rename-migration sidecar', () => {
    const renameRes = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Drafting',
      '--to-stage', 'Writing',
    );
    expect(renameRes.code).toBe(0);

    const listRes = pipeline(project, 'list');
    expect(listRes.stderr).toBe('');
    expect(listRes.code).toBe(0);
    const parsed = JSON.parse(listRes.stdout) as { pipelines: Array<{ id: string }> };
    const ids = parsed.pipelines.map((p) => p.id);
    expect(ids).toContain('my-blog');
    // No 'my-blog-renames' or similar legacy id appears.
    expect(ids.some((id) => id.includes('renames'))).toBe(false);
    expect(ids.some((id) => id.includes('migration'))).toBe(false);
  });
});

describe('deskwork pipeline update --remove-stage', () => {
  it('removes from linearStages', () => {
    const res = pipeline(
      project, 'update', 'my-blog', '--remove-stage', 'Review',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['linearStages']).toEqual(['Idea', 'Drafting', 'Live']);
  });

  it('removes from offPipelineStages', () => {
    const res = pipeline(
      project, 'update', 'my-blog', '--remove-stage', 'Blocked',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['offPipelineStages']).toEqual(['Cancelled']);
  });

  it('refuses when entries reference the stage via lane binding', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'my-blog',
    });
    writeSidecar(
      project,
      '550e8400-e29b-41d4-a716-446655440000',
      'post-a',
      { lane: 'default', currentStage: 'Review' },
    );
    const res = pipeline(
      project, 'update', 'my-blog', '--remove-stage', 'Review',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/1 entry references.*post-a/);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['linearStages']).toContain('Review');
  });

  it('allows removal when referencing entries belong to a different-template lane', () => {
    writeLaneJson(project, 'other', {
      id: 'other',
      name: 'Other',
      pipelineTemplate: 'editorial',
    });
    writeSidecar(
      project,
      '550e8400-e29b-41d4-a716-446655440001',
      'unrelated-post',
      { lane: 'other', currentStage: 'Drafting' },
    );
    const res = pipeline(
      project, 'update', 'my-blog', '--remove-stage', 'Review',
    );
    expect(res.code).toBe(0);
  });

  it('refuses removal that would empty linearStages', () => {
    writePipelineOverride(project, 'tiny', {
      id: 'tiny',
      name: 'Tiny',
      description: 'x',
      linearStages: ['Only'],
      offPipelineStages: [],
    });
    const res = pipeline(
      project, 'update', 'tiny', '--remove-stage', 'Only',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/leave linearStages empty/);
  });
});

describe('deskwork pipeline update --set-locked', () => {
  it('replaces lockedStages wholesale', () => {
    const res = pipeline(
      project, 'update', 'my-blog', '--set-locked', 'Review,Live',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['lockedStages']).toEqual(['Review', 'Live']);
  });

  it('refuses stages not in linearStages', () => {
    const res = pipeline(
      project, 'update', 'my-blog', '--set-locked', 'Drafting,Bogus',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not in linearStages|subset/);
  });
});

describe('deskwork pipeline update --set-off-pipeline', () => {
  it('replaces offPipelineStages wholesale', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--set-off-pipeline', 'Blocked,Cancelled,Archived',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['offPipelineStages']).toEqual([
      'Blocked', 'Cancelled', 'Archived',
    ]);
  });

  it('refuses overlap with linearStages', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--set-off-pipeline', 'Blocked,Drafting',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already in linearStages|either linear OR off-pipeline/);
  });
});

describe('deskwork pipeline update (refusal modes)', () => {
  it('refuses when no operation flag is supplied', () => {
    const res = pipeline(project, 'update', 'my-blog');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/no operation flag/);
  });

  it('refuses when more than one operation flag is supplied', () => {
    const res = pipeline(
      project, 'update', 'my-blog',
      '--add-stage', 'X',
      '--remove-stage', 'Drafting',
    );
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/mutually exclusive/);
  });

  it('refuses to mutate a plugin preset that has no project override', () => {
    const res = pipeline(
      project, 'update', 'editorial', '--add-stage', 'X',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/plugin preset.*read-only|customize pipeline editorial/i);
  });

  it('refuses when no override exists for a non-preset id', () => {
    const res = pipeline(
      project, 'update', 'nonexistent', '--add-stage', 'X',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/no project override exists/);
  });
});
