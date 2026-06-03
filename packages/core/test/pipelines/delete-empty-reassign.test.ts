/**
 * Regression test for AUDIT-20260530-55 (cross-model:
 * AUDIT-BARRAGE-claude-P6-1) — `deletePipeline` must treat an empty-string
 * `reassignLanesTo` as "no reassign target" so the dependent-lane refusal
 * guard still fires.
 *
 * Pre-fix behavior (Phase 6 Task 6.2, original shape): the dependent-lane
 * refusal was gated on `reassignLanesTo === undefined`, while the
 * validation block and the rebind loop were gated on
 * `reassignLanesTo !== undefined && reassignLanesTo.length > 0`. An empty
 * string is neither `undefined` nor length-`> 0`, so:
 *
 *   - Refusal guard: `dependents.length > 0 && ('' === undefined)` → false
 *     (no refusal, dependent lane silently bypassed).
 *   - Validation: `('' !== undefined) && (0 > 0)` → false (no
 *     `loadPipelineTemplate` check).
 *   - Rebind loop: same gate, skipped (no lane rewrites).
 *   - Then `unlinkSync(path)` fires — the override is deleted while every
 *     dependent lane is left pointing at a now-missing template. Silent
 *     data-integrity failure with exit 0.
 *
 * Post-fix shape: both guards are tightened to
 * `reassignLanesTo == null || reassignLanesTo.length === 0`, so an empty
 * reassign target triggers the dependent-lane refusal AND skips the
 * rebind block. The CLI boundary also normalizes empty-string to
 * `undefined`; the operation-boundary guards remain as the defense-in-
 * depth backstop covered by THIS test.
 *
 * Coverage rationale (paired with
 * `packages/cli/test/pipeline/delete.test.ts` "refuses
 * --reassign-lanes-to \"\""): the CLI test exercises the end-to-end
 * subprocess path; this unit test pins the operation-level guard
 * directly so a future refactor that bypasses the CLI (calling
 * `deletePipeline` from a programmatic surface or a different
 * front-end) cannot reintroduce the silent-orphan failure.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { laneConfigPath, lanesDir } from '../../src/lanes/loader.ts';
import { deletePipeline } from '../../src/pipelines/operations/delete.ts';
import {
  pipelineOverridePath,
  pipelineOverridesDir,
} from '../../src/pipelines/loader.ts';

const OVERRIDE_TEMPLATE = {
  id: 'my-blog',
  name: 'My Blog',
  description: 'Operator pipeline for the AUDIT-20260530-55 regression test.',
  linearStages: ['Idea', 'Drafting', 'Live'],
  offPipelineStages: [],
};

function writeMyBlogOverride(projectRoot: string): void {
  const overrideDir = pipelineOverridesDir(projectRoot);
  mkdirSync(overrideDir, { recursive: true });
  writeFileSync(
    join(overrideDir, `${OVERRIDE_TEMPLATE.id}.json`),
    JSON.stringify(OVERRIDE_TEMPLATE, null, 2),
    'utf8',
  );
}

function writeDefaultLane(projectRoot: string, pipelineTemplate: string): void {
  mkdirSync(lanesDir(projectRoot), { recursive: true });
  writeFileSync(
    laneConfigPath(projectRoot, 'default'),
    JSON.stringify(
      {
        id: 'default',
        name: 'Default',
        pipelineTemplate,
      },
      null,
      2,
    ),
    'utf8',
  );
}

interface LaneOnDisk {
  readonly pipelineTemplate: string;
}

function readLane(projectRoot: string, id: string): LaneOnDisk {
  const raw = readFileSync(laneConfigPath(projectRoot, id), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('pipelineTemplate' in parsed)
    || typeof (parsed as { pipelineTemplate: unknown }).pipelineTemplate !== 'string'
  ) {
    throw new Error(`lane ${id} on disk is missing string pipelineTemplate`);
  }
  return { pipelineTemplate: (parsed as { pipelineTemplate: string }).pipelineTemplate };
}

describe('deletePipeline empty-string reassignLanesTo (AUDIT-20260530-55)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-delete-empty-reassign-'));
    mkdirSync(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses when a dependent lane exists and reassignLanesTo is "" (empty)', async () => {
    writeMyBlogOverride(projectRoot);
    writeDefaultLane(projectRoot, 'my-blog');

    await expect(
      deletePipeline(projectRoot, { id: 'my-blog', reassignLanesTo: '' }),
    ).rejects.toThrow(/lane references it|lanes reference it/);

    // The override must still be on disk — the refusal fired before unlink.
    expect(existsSync(pipelineOverridePath(projectRoot, 'my-blog'))).toBe(true);
    // The dependent lane's pipelineTemplate must be unchanged.
    expect(readLane(projectRoot, 'default').pipelineTemplate).toBe('my-blog');
  });

  it('deletes cleanly when reassignLanesTo is "" and no lane depends on the template', async () => {
    writeMyBlogOverride(projectRoot);

    const result = await deletePipeline(projectRoot, {
      id: 'my-blog',
      reassignLanesTo: '',
    });

    expect(result.reassignedLanes).toEqual([]);
    expect(existsSync(pipelineOverridePath(projectRoot, 'my-blog'))).toBe(false);
  });

  it('still rebinds when reassignLanesTo names a real template (regression: fix preserves the happy path)', async () => {
    writeMyBlogOverride(projectRoot);
    writeDefaultLane(projectRoot, 'my-blog');

    const result = await deletePipeline(projectRoot, {
      id: 'my-blog',
      reassignLanesTo: 'editorial',
    });

    expect(result.reassignedLanes).toEqual([
      { laneId: 'default', from: 'my-blog', to: 'editorial' },
    ]);
    expect(existsSync(pipelineOverridePath(projectRoot, 'my-blog'))).toBe(false);
    expect(readLane(projectRoot, 'default').pipelineTemplate).toBe('editorial');
  });
});
