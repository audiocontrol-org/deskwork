/**
 * Regression test for AUDIT-20260530-62 (cross-model:
 * AUDIT-BARRAGE-codex-P6-1) — `pipeline update --remove-stage` must
 * refuse when a legacy sidecar (no `lane` field) at the doomed stage
 * resolves through the `default` lane to the mutated pipeline.
 *
 * Surface: `packages/core/src/pipelines/operations/update.ts` —
 * `refuseRemoveStageWhenReferenced`.
 *
 * Pre-fix behavior: the refusal walker contained
 * `if (entry.lane === undefined) continue;`, so every sidecar lacking
 * a `lane` field was silently skipped. A project with a `default`
 * lane bound to `my-blog` and a legacy entry at `currentStage: "Review"`
 * (no `lane` field) would pass the refusal check and allow
 * `pipeline update my-blog --remove-stage Review`, even though the
 * legacy entry still occupies that stage.
 *
 * Post-fix shape: the walker mirrors `lane move`'s migration-window
 * convention — when `entry.lane` is undefined, resolve via the
 * `default` lane (matching the `DEFAULT_LANE_ID` used by
 * `moveEntryToLane`). Only skip when the entry truly cannot bind to
 * the mutated template (either the `default` lane config does not
 * exist, OR it does exist and binds to a DIFFERENT pipeline).
 *
 * Coverage rationale: the refusal walker is a guard the operator
 * relies on at the CLI boundary; the bug is a silent allow-through,
 * not a noisy error. The only way to catch it is a direct unit test
 * against `updatePipeline` with a fixture that mirrors the
 * migration-window state (legacy sidecar + default lane bound to the
 * mutated pipeline).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { laneConfigPath, lanesDir } from '../../src/lanes/loader.ts';
import { updatePipeline } from '../../src/pipelines/operations/update.ts';
import {
  pipelineOverridePath,
  pipelineOverridesDir,
} from '../../src/pipelines/loader.ts';
import { sidecarsDir } from '../../src/sidecar/paths.ts';
import type { Entry } from '../../src/schema/entry.ts';

const LEGACY_UUID = '22222222-2222-4222-8222-222222222222';

const MY_BLOG_OVERRIDE = {
  id: 'my-blog',
  name: 'My Blog',
  description: 'Operator pipeline for the AUDIT-20260530-62 regression test.',
  linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
  offPipelineStages: [],
};

const OTHER_OVERRIDE = {
  id: 'other-blog',
  name: 'Other Blog',
  description: 'A second pipeline for the AUDIT-20260530-62 negative test.',
  linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
  offPipelineStages: [],
};

function writePipelineOverride(
  projectRoot: string,
  override: typeof MY_BLOG_OVERRIDE,
): void {
  const overrideDir = pipelineOverridesDir(projectRoot);
  mkdirSync(overrideDir, { recursive: true });
  writeFileSync(
    join(overrideDir, `${override.id}.json`),
    JSON.stringify(override, null, 2),
    'utf8',
  );
}

function writeLane(
  projectRoot: string,
  id: string,
  pipelineTemplate: string,
): void {
  mkdirSync(lanesDir(projectRoot), { recursive: true });
  writeFileSync(
    laneConfigPath(projectRoot, id),
    JSON.stringify(
      {
        id,
        name: id === 'default' ? 'Default' : id,
        pipelineTemplate,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function writeLegacySidecar(
  projectRoot: string,
  overrides: Partial<Entry> = {},
): void {
  const now = new Date().toISOString();
  // Legacy entry — sidecar predates the lane-migration window and
  // therefore lacks a `lane` field. The `lane move` and (post-fix)
  // `refuseRemoveStageWhenReferenced` code paths both treat missing
  // `lane` as the implicit `default` lane.
  const entry: Entry = {
    uuid: LEGACY_UUID,
    slug: 'legacy-review-entry',
    title: 'Legacy Review entry',
    keywords: [],
    source: 'manual',
    currentStage: 'Review',
    iterationByStage: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  const dir = sidecarsDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${entry.uuid}.json`),
    JSON.stringify(entry, null, 2),
    'utf8',
  );
}

describe('updatePipeline --remove-stage refusal with legacy default-lane entries (AUDIT-20260530-62)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(
      join(tmpdir(), 'deskwork-remove-stage-legacy-'),
    );
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses removal when a legacy sidecar (no `lane` field) at the doomed stage resolves through the `default` lane to the mutated pipeline', async () => {
    writePipelineOverride(projectRoot, MY_BLOG_OVERRIDE);
    writeLane(projectRoot, 'default', 'my-blog');
    writeLegacySidecar(projectRoot);

    await expect(
      updatePipeline(projectRoot, {
        id: 'my-blog',
        operation: { op: 'remove-stage', stage: 'Review' },
      }),
    ).rejects.toThrow(/legacy-review-entry/);

    // The error must specifically name the offending entry's slug AND
    // the doomed stage — that's the diagnostic operators need.
    await expect(
      updatePipeline(projectRoot, {
        id: 'my-blog',
        operation: { op: 'remove-stage', stage: 'Review' },
      }),
    ).rejects.toThrow(/stage "Review"/);
  });

  it('does NOT refuse when the `default` lane is bound to a DIFFERENT pipeline (the legacy entry does not belong to `my-blog`)', async () => {
    // Two overrides on disk. The legacy entry's implicit lane is
    // `default`, which is bound to `other-blog` — the entry has no
    // association with `my-blog`. Removing `Review` from `my-blog`
    // must succeed because no entry actually occupies that stage in
    // the `my-blog` pipeline.
    writePipelineOverride(projectRoot, MY_BLOG_OVERRIDE);
    writePipelineOverride(projectRoot, OTHER_OVERRIDE);
    writeLane(projectRoot, 'default', 'other-blog');
    writeLegacySidecar(projectRoot);

    const result = await updatePipeline(projectRoot, {
      id: 'my-blog',
      operation: { op: 'remove-stage', stage: 'Review' },
    });

    expect(result.template.linearStages).not.toContain('Review');
    expect(result.path).toBe(pipelineOverridePath(projectRoot, 'my-blog'));
  });

  it('does NOT refuse when no `default` lane exists at all (the legacy entry cannot be bound to any template)', async () => {
    // Override present; legacy entry present; no lane configs at all.
    // The walker has no `default` lane to resolve through, so the
    // entry's binding is genuinely unknowable. Skip (no refusal),
    // matching the pre-fix behavior on the no-default-lane corner.
    writePipelineOverride(projectRoot, MY_BLOG_OVERRIDE);
    writeLegacySidecar(projectRoot);

    const result = await updatePipeline(projectRoot, {
      id: 'my-blog',
      operation: { op: 'remove-stage', stage: 'Review' },
    });

    expect(result.template.linearStages).not.toContain('Review');
  });
});
