/**
 * deskwork CLI `pipeline delete` — refusal modes + reassign-lanes-to.
 *
 * Phase 6 Task 6.2 (graphical-entries). Covers the four refusal paths
 * (plugin-preset, missing override, dependent lanes, malformed
 * reassignment target) plus the happy paths (orphan template, batch
 * rebind).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  assertDeskworkBinPresent,
  destroyProject,
  makeProject,
  pipeline,
  pipelineOverrideExists,
  readLaneJson,
  writeLaneJson,
  writePipelineOverride,
} from './helpers.ts';

beforeAll(() => { assertDeskworkBinPresent(); });

let project: string;
beforeEach(() => {
  project = makeProject();
  writePipelineOverride(project, 'my-blog', {
    id: 'my-blog',
    name: 'My Blog',
    description: 'x',
    linearStages: ['Idea', 'Drafting', 'Live'],
    offPipelineStages: [],
  });
});
afterEach(() => { destroyProject(project); });

describe('deskwork pipeline delete', () => {
  it('removes a project-override JSON when no lane references it', () => {
    const res = pipeline(project, 'delete', 'my-blog');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(pipelineOverrideExists(project, 'my-blog')).toBe(false);

    const parsed = JSON.parse(res.stdout) as {
      deleted: boolean;
      reassignedLanes: unknown[];
    };
    expect(parsed.deleted).toBe(true);
    expect(parsed.reassignedLanes).toEqual([]);
  });

  it('refuses against a plugin preset', () => {
    const res = pipeline(project, 'delete', 'editorial');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/plugin preset.*cannot be deleted|customize pipeline editorial/i);
  });

  it('refuses when no project override exists', () => {
    const res = pipeline(project, 'delete', 'no-such-template');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/no project override exists/);
  });

  it('refuses when a lane references the template', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'my-blog',
      contentDir: 'docs',
    });
    const res = pipeline(project, 'delete', 'my-blog');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/1 lane references it.*default/);
    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
  });

  it('reassigns lanes when --reassign-lanes-to is supplied', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'my-blog',
      contentDir: 'docs',
    });
    writeLaneJson(project, 'second', {
      id: 'second',
      name: 'Second',
      pipelineTemplate: 'my-blog',
      contentDir: 'src/mockups',
    });

    const res = pipeline(
      project, 'delete', 'my-blog',
      '--reassign-lanes-to', 'editorial',
    );
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    expect(pipelineOverrideExists(project, 'my-blog')).toBe(false);
    expect(readLaneJson(project, 'default')['pipelineTemplate']).toBe('editorial');
    expect(readLaneJson(project, 'second')['pipelineTemplate']).toBe('editorial');

    const parsed = JSON.parse(res.stdout) as {
      reassignedLanes: Array<{ laneId: string; from: string; to: string }>;
    };
    const laneIds = parsed.reassignedLanes.map((r) => r.laneId).sort();
    expect(laneIds).toEqual(['default', 'second']);
    expect(parsed.reassignedLanes[0].from).toBe('my-blog');
    expect(parsed.reassignedLanes[0].to).toBe('editorial');
  });

  it('refuses --reassign-lanes-to when the replacement template does not resolve', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'my-blog',
      contentDir: 'docs',
    });
    const res = pipeline(
      project, 'delete', 'my-blog',
      '--reassign-lanes-to', 'no-such-target',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/does not resolve|not found/);
    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
    // Source lane untouched
    expect(readLaneJson(project, 'default')['pipelineTemplate']).toBe('my-blog');
  });

  it('refuses --reassign-lanes-to <same-id>', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'my-blog',
      contentDir: 'docs',
    });
    const res = pipeline(
      project, 'delete', 'my-blog',
      '--reassign-lanes-to', 'my-blog',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/same id being deleted/);
    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
  });

  it('refuses when the id positional is missing', () => {
    const res = pipeline(project, 'delete');
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Usage: deskwork pipeline/);
  });
});
