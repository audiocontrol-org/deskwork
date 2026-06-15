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
  pipelineRenamesExists,
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
    });
    writeLaneJson(project, 'second', {
      id: 'second',
      name: 'Second',
      pipelineTemplate: 'my-blog',
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

  // Reviewer-fix #2: defense-in-depth path-traversal validation on
  // delete. Without the explicit assertSafePipelineId, an id like
  // `../../etc/foo` resolves outside the override directory; if such
  // a file exists, hasPipelineOverride returns true and unlinkSync
  // would delete the traversed file.
  it('refuses pipeline ids that fail the kebab-case charset', () => {
    const res = pipeline(project, 'delete', 'UPPER');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid pipeline id/);
  });

  it('refuses pipeline ids that look like path-traversal', () => {
    const res = pipeline(project, 'delete', '../../etc/foo');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid pipeline id/);
  });

  it('refuses --reassign-lanes-to values that fail charset validation', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'my-blog',
    });
    const res = pipeline(
      project, 'delete', 'my-blog',
      '--reassign-lanes-to', '../../etc/foo',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Invalid pipeline id/);
    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
  });

  // AUDIT-20260530-55 (cross-model: AUDIT-BARRAGE-claude-P6-1). An
  // empty-string `--reassign-lanes-to` value (e.g. an unset shell
  // variable expanded as `--reassign-lanes-to ""`) used to slip past
  // both the dependent-lane refusal guard (`reassignLanesTo === undefined`)
  // and the validation/rebind block (`reassignLanesTo.length > 0`),
  // causing the override to be unlinked while every dependent lane
  // was left pointing at a now-missing template. The fix normalizes
  // empty-string to "no target" at the CLI boundary AND tightens the
  // guards in `deletePipeline`. With a dependent lane present, the
  // dependent-lane refusal must fire and the override must remain.
  it('refuses --reassign-lanes-to "" (empty string) with dependent lanes', () => {
    writeLaneJson(project, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'my-blog',
    });
    const res = pipeline(
      project, 'delete', 'my-blog',
      '--reassign-lanes-to', '',
    );
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/1 lane references it.*default/);
    // The override file must survive — the refusal fired BEFORE unlink.
    expect(pipelineOverrideExists(project, 'my-blog')).toBe(true);
    // The dependent lane's pipelineTemplate must be unchanged.
    expect(readLaneJson(project, 'default')['pipelineTemplate']).toBe('my-blog');
  });

  // Companion to AUDIT-20260530-55: when no lane depends on the
  // template, `--reassign-lanes-to ""` is semantically equivalent to
  // omitting the flag entirely — the override deletes cleanly with an
  // empty `reassignedLanes` list. This guards against an over-eager
  // fix that treats empty-string as a hard error even when no rebind
  // would have been required.
  it('treats --reassign-lanes-to "" as no-target when no lanes depend', () => {
    const res = pipeline(
      project, 'delete', 'my-blog',
      '--reassign-lanes-to', '',
    );
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(pipelineOverrideExists(project, 'my-blog')).toBe(false);
    const parsed = JSON.parse(res.stdout) as {
      reassignedLanes: unknown[];
    };
    expect(parsed.reassignedLanes).toEqual([]);
  });

  // Reviewer-fix #3: deleting a pipeline must unlink any rename-
  // migration sidecar that exists, so a subsequent
  // `pipeline create <same-id>` does not inherit stale audit data.
  it('unlinks the rename-migration sidecar alongside the template JSON', () => {
    // First, generate a rename so the migration sidecar exists.
    const renameRes = pipeline(
      project, 'update', 'my-blog',
      '--rename-stage', 'Drafting',
      '--to-stage', 'Writing',
    );
    expect(renameRes.code).toBe(0);
    expect(pipelineRenamesExists(project, 'my-blog')).toBe(true);

    // Now delete the pipeline. The sidecar must be cleaned up.
    const deleteRes = pipeline(project, 'delete', 'my-blog');
    expect(deleteRes.stderr).toBe('');
    expect(deleteRes.code).toBe(0);

    expect(pipelineOverrideExists(project, 'my-blog')).toBe(false);
    expect(pipelineRenamesExists(project, 'my-blog')).toBe(false);
  });
});
