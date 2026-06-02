/**
 * deskwork CLI `pipeline` — list / show / create verbs.
 *
 * Phase 6 Task 6.2 (graphical-entries). Read-side and creation
 * verbs. Mutation verbs (update / delete) live in their own test
 * files.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertDeskworkBinPresent,
  destroyProject,
  makeProject,
  pipeline,
  pipelineOverrideExists,
  readPipelineOverride,
  writePipelineOverride,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => { project = makeProject(); });
afterEach(() => { destroyProject(project); });

describe('deskwork pipeline list', () => {
  it('emits the built-in plugin presets when no override exists', () => {
    const res = pipeline(project, 'list');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { pipelines: Array<{ id: string }> };
    const ids = parsed.pipelines.map((p) => p.id).sort();
    expect(ids).toEqual(['blog-post', 'editorial', 'feature-doc', 'qa-plan', 'visual']);
  });

  it('--full emits stage counts + source classification', () => {
    const res = pipeline(project, 'list', '--full');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      pipelines: Array<{
        id: string;
        name: string;
        source: string;
        linearStageCount: number;
        lockedStageCount: number;
        offPipelineStageCount: number;
      }>;
    };
    const editorial = parsed.pipelines.find((p) => p.id === 'editorial');
    expect(editorial).toBeDefined();
    expect(editorial?.source).toBe('plugin-preset');
    expect(editorial?.linearStageCount).toBe(6);
    expect(editorial?.lockedStageCount).toBe(1);
    expect(editorial?.offPipelineStageCount).toBe(2);
  });

  it('reports project-override classification when an override masks a preset', () => {
    writePipelineOverride(project, 'editorial', {
      id: 'editorial',
      name: 'Editorial (Override)',
      description: 'Project override',
      linearStages: ['A', 'B', 'C'],
      offPipelineStages: [],
    });
    const res = pipeline(project, 'list', '--full');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      pipelines: Array<{ id: string; source: string; linearStageCount: number }>;
    };
    const editorial = parsed.pipelines.find((p) => p.id === 'editorial');
    expect(editorial?.source).toBe('project-override');
    expect(editorial?.linearStageCount).toBe(3);
  });

  it('surfaces healthy templates plus a malformed section when one override is corrupt (AUDIT-20260530-57)', () => {
    // Write a malformed override JSON directly, bypassing
    // writePipelineOverride's JSON.stringify, so enumeration includes
    // the id but loadPipelineTemplate would throw.
    const dir = join(project, '.deskwork', 'pipelines');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'broken-override.json'), '{ not json', 'utf-8');

    const res = pipeline(project, 'list');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      pipelines: Array<{ id: string }>;
      malformed: Array<{ id: string; error: string }>;
    };
    // Healthy built-in presets still emit.
    const ids = parsed.pipelines.map((p) => p.id);
    expect(ids).toContain('editorial');
    expect(ids).toContain('blog-post');
    // The corrupt override surfaces under malformed.
    expect(parsed.malformed.map((m) => m.id)).toEqual(['broken-override']);
  });
});

describe('deskwork pipeline show', () => {
  it('emits the resolved JSON for a plugin preset', () => {
    const res = pipeline(project, 'show', 'editorial');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      id: string;
      linearStages: string[];
      source: string;
    };
    expect(parsed.id).toBe('editorial');
    expect(parsed.source).toBe('plugin-preset');
    expect(parsed.linearStages).toEqual([
      'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published',
    ]);
  });

  it('prefers a project override over the plugin preset', () => {
    writePipelineOverride(project, 'editorial', {
      id: 'editorial',
      name: 'Editorial Override',
      description: 'Operator override',
      linearStages: ['A', 'B'],
      offPipelineStages: [],
    });
    const res = pipeline(project, 'show', 'editorial');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      linearStages: string[];
      source: string;
    };
    expect(parsed.source).toBe('project-override');
    expect(parsed.linearStages).toEqual(['A', 'B']);
  });

  it('refuses when the pipeline does not exist', () => {
    const res = pipeline(project, 'show', 'no-such-template');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/not found/);
  });

  it('refuses when the id positional is missing', () => {
    const res = pipeline(project, 'show');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork pipeline/);
  });
});

describe('deskwork pipeline create', () => {
  it('writes a new project-override template with the supplied shape', () => {
    const res = pipeline(
      project,
      'create', 'my-blog',
      '--shape', 'Idea,Drafting,Review,Live',
      '--name', 'My Blog',
    );
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      created: boolean;
      linearStages: string[];
      lockedStages: string[];
      offPipelineStages: string[];
    };
    expect(parsed.created).toBe(true);
    expect(parsed.linearStages).toEqual(['Idea', 'Drafting', 'Review', 'Live']);
    expect(parsed.lockedStages).toEqual([]);
    expect(parsed.offPipelineStages).toEqual([]);

    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['id']).toBe('my-blog');
    expect(onDisk['name']).toBe('My Blog');
    expect(onDisk['linearStages']).toEqual(['Idea', 'Drafting', 'Review', 'Live']);
  });

  it('defaults --name to the id when omitted', () => {
    const res = pipeline(
      project,
      'create', 'my-blog',
      '--shape', 'Idea,Drafting',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['name']).toBe('my-blog');
  });

  it('trims whitespace around comma-separated stages', () => {
    const res = pipeline(
      project,
      'create', 'my-blog',
      '--shape', ' Idea , Drafting , Live ',
    );
    expect(res.code).toBe(0);
    const onDisk = readPipelineOverride(project, 'my-blog');
    expect(onDisk['linearStages']).toEqual(['Idea', 'Drafting', 'Live']);
  });

  it('refuses to clobber a plugin preset id', () => {
    const res = pipeline(
      project,
      'create', 'editorial',
      '--shape', 'A,B,C',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/plugin preset.*read-only|customize pipeline editorial/i);
    expect(pipelineOverrideExists(project, 'editorial')).toBe(false);
  });

  it('refuses when a project override already exists', () => {
    writePipelineOverride(project, 'my-blog', {
      id: 'my-blog',
      name: 'My Blog',
      description: 'x',
      linearStages: ['A'],
      offPipelineStages: [],
    });
    const res = pipeline(
      project,
      'create', 'my-blog',
      '--shape', 'X,Y',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/project override already exists/);
  });

  it('refuses when --shape is missing', () => {
    const res = pipeline(project, 'create', 'my-blog');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Missing required flag --shape/);
  });

  it('refuses pipeline ids that fail the kebab-case charset', () => {
    const res = pipeline(
      project,
      'create', 'UPPER',
      '--shape', 'A,B',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid pipeline id/);
  });

  it('refuses pipeline ids that look like path-traversal', () => {
    const res = pipeline(
      project,
      'create', '../../etc/foo',
      '--shape', 'A,B',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid pipeline id/);
  });

  it('refuses a --shape value with a blank stage', () => {
    const res = pipeline(
      project,
      'create', 'my-blog',
      '--shape', 'Idea,,Live',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/blank/);
  });

  it('refuses an empty --shape', () => {
    const res = pipeline(
      project,
      'create', 'my-blog',
      '--shape', '',
    );
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/--shape requires a non-empty/);
  });
});

describe('deskwork pipeline (generic)', () => {
  it('prints usage when no verb is supplied', () => {
    const res = pipeline(project);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork pipeline/);
  });

  it('prints an unknown-verb error', () => {
    const res = pipeline(project, 'nope');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Unknown pipeline verb: nope/);
  });
});
