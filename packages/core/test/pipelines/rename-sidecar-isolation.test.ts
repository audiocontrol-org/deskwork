/**
 * Regression test for AUDIT-20260530-54 (cross-model:
 * AUDIT-BARRAGE-claude-P6-1) — rename-migration sidecar must not pollute
 * the pipeline-template enumerator.
 *
 * Pre-fix behavior (Phase 6 Task 6.2, original shape): the rename verb
 * wrote `<pipelineId>-renames.json` INTO the override directory the
 * loader scans. `listAvailablePipelineTemplates` happily picked up the
 * basename; `listPipelines` then called `loadPipelineTemplate` for the
 * phantom id, which Zod-rejected the migration schema and threw. `pipeline
 * list` (and the studio surfaces that call it) broke project-wide after
 * any rename.
 *
 * Post-fix shape: the sidecar lives in the `migrations/` SIBLING
 * subdirectory. The loader's `listJsonBasenames` does NOT recurse, so the
 * `migrations/` directory is invisible to template enumeration; the
 * regression cannot recur from this code path.
 *
 * Coverage rationale (paired with `packages/cli/test/pipeline/update.test.ts`
 * "does not pollute the pipeline list..."): the CLI test exercises the
 * end-to-end subprocess path; this unit test pins the loader-level
 * isolation contract directly so a future refactor that moves the
 * sidecar back into the enumerated namespace fails at the core boundary
 * before it can reach the CLI surface.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listAvailablePipelineTemplates,
  pipelineMigrationPath,
  pipelineMigrationsDir,
  pipelineOverridesDir,
} from '../../src/pipelines/loader.ts';
import { listPipelines } from '../../src/pipelines/operations/list.ts';
import { updatePipeline } from '../../src/pipelines/operations/update.ts';

const OVERRIDE_TEMPLATE = {
  id: 'my-blog',
  name: 'My Blog',
  description: 'Operator pipeline for the regression test.',
  linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
  offPipelineStages: ['Blocked', 'Cancelled'],
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

describe('rename-migration sidecar isolation (AUDIT-20260530-54)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-rename-isolation-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('writes the rename sidecar into a migrations/ subdir, not the override dir', async () => {
    writeMyBlogOverride(projectRoot);

    await updatePipeline(projectRoot, {
      id: 'my-blog',
      operation: { op: 'rename-stage', from: 'Drafting', to: 'Writing' },
    });

    // The sidecar lives under .deskwork/pipelines/migrations/<id>.json.
    const expectedSidecar = pipelineMigrationPath(projectRoot, 'my-blog');
    expect(existsSync(expectedSidecar)).toBe(true);
    expect(expectedSidecar).toBe(
      join(pipelineMigrationsDir(projectRoot), 'my-blog.json'),
    );

    // The override dir contains the template JSON only — no sibling
    // file named like a phantom template. Specifically, no
    // `<id>-renames.json` (pre-fix shape) is permitted.
    const overrideEntries = readdirSync(pipelineOverridesDir(projectRoot));
    const renamePhantoms = overrideEntries.filter((entry) =>
      entry.endsWith('-renames.json'),
    );
    expect(renamePhantoms).toEqual([]);
  });

  it('listAvailablePipelineTemplates does not surface a rename-sidecar id after a rename', async () => {
    writeMyBlogOverride(projectRoot);

    await updatePipeline(projectRoot, {
      id: 'my-blog',
      operation: { op: 'rename-stage', from: 'Drafting', to: 'Writing' },
    });

    const ids = listAvailablePipelineTemplates(projectRoot);
    expect(ids).toContain('my-blog');
    // The enumerator must not see `my-blog-renames`, `migrations`, or
    // any id derived from the sidecar file. The pre-fix shape emitted
    // `my-blog-renames` here; the post-fix shape MUST not.
    expect(ids).not.toContain('my-blog-renames');
    expect(ids).not.toContain('migrations');
    expect(ids.some((id) => id.includes('-renames'))).toBe(false);
  });

  it('listPipelines does not throw after a rename (the original break)', async () => {
    writeMyBlogOverride(projectRoot);

    await updatePipeline(projectRoot, {
      id: 'my-blog',
      operation: { op: 'rename-stage', from: 'Drafting', to: 'Writing' },
    });

    // Pre-fix: listPipelines threw a Zod validation error here because
    // it tried to load `my-blog-renames.json` (the sidecar) as a
    // pipeline template. Post-fix: enumeration is clean.
    expect(() => listPipelines(projectRoot)).not.toThrow();

    const listed = listPipelines(projectRoot);
    const ids = listed.pipelines.map((p) => p.id);
    expect(ids).toContain('my-blog');
    expect(ids.some((id) => id.includes('renames'))).toBe(false);

    // The rename actually landed: the override template now reports the
    // post-rename stage names. Confirms the rename succeeded AND the
    // list surface stayed healthy on the same disk state.
    const myBlog = listed.pipelines.find((p) => p.id === 'my-blog');
    expect(myBlog).toBeDefined();
    expect(myBlog?.template.linearStages).toEqual(
      ['Idea', 'Writing', 'Review', 'Live'],
    );
  });

  it('multiple sequential renames keep the list surface healthy', async () => {
    writeMyBlogOverride(projectRoot);

    await updatePipeline(projectRoot, {
      id: 'my-blog',
      operation: { op: 'rename-stage', from: 'Drafting', to: 'Writing' },
    });
    await updatePipeline(projectRoot, {
      id: 'my-blog',
      operation: { op: 'rename-stage', from: 'Review', to: 'Editing' },
    });

    // Both renames append to the SAME migration sidecar; the sidecar
    // count is one regardless of how many renames have happened, so the
    // enumerator never sees per-rename file pollution.
    const migrationsRoot = pipelineMigrationsDir(projectRoot);
    expect(readdirSync(migrationsRoot)).toEqual(['my-blog.json']);

    expect(() => listPipelines(projectRoot)).not.toThrow();
    const ids = listPipelines(projectRoot).pipelines.map((p) => p.id);
    expect(ids).toContain('my-blog');
    expect(ids.some((id) => id.includes('renames'))).toBe(false);
  });
});
