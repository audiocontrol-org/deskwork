/**
 * Regression test for AUDIT-20260530-63 (cross-model:
 * AUDIT-BARRAGE-codex-P6-1) — `deletePipeline` must roll back partial
 * lane reassignments when a later lane write fails mid-batch.
 *
 * Pre-fix behavior (Phase 6 Task 6.2 original shape): the batch
 * reassign loop commits each dependent lane one by one. If the 2nd
 * lane's write throws, the 1st lane is already rebound on disk and the
 * pipeline override is still present, leaving the operator with a
 * mixed state: lane A points at the replacement, lane C still points
 * at the doomed template, override still on disk. Each individual
 * write is atomic but the multi-file operation is not. The operator
 * is told the delete failed but the on-disk state has silently
 * diverged from both the pre- and post-states.
 *
 * Post-fix shape: snapshot every dependent lane's original config
 * BEFORE the rebind loop runs. Wrap the rebind loop + unlink + journal
 * append in try/catch. On failure during rebind, restore each already-
 * rebound lane from snapshot. On failure during unlink, same restore.
 * Journal-append failure after unlink is best-effort: warn and accept
 * (the template is already gone; we don't undo the delete to chase a
 * journal write).
 *
 * The test simulates the mid-batch failure by pre-creating the lane
 * commit's tmp-file path as a DIRECTORY for the 2nd lane in the
 * iteration. `commitLaneConfig` writes its candidate to
 * `<path>.<process.pid>.tmp` before rename; that `writeFileSync` call
 * fails with EISDIR when the path is already a directory, throwing
 * out of the rebind loop. Lane A (written before the failure) must be
 * restored; lane C (never reached) must be untouched; the pipeline
 * override must still exist; the journal must NOT carry a delete
 * event.
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

const DOOMED_TEMPLATE = {
  id: 'doomed-pipeline',
  name: 'Doomed Pipeline',
  description: 'Override template for the AUDIT-20260530-63 regression test.',
  linearStages: ['Idea', 'Drafting', 'Live'],
  offPipelineStages: [],
};

function writeDoomedOverride(projectRoot: string): void {
  const overrideDir = pipelineOverridesDir(projectRoot);
  mkdirSync(overrideDir, { recursive: true });
  writeFileSync(
    join(overrideDir, `${DOOMED_TEMPLATE.id}.json`),
    JSON.stringify(DOOMED_TEMPLATE, null, 2),
    'utf8',
  );
}

function writeLane(projectRoot: string, id: string, payload: unknown): void {
  mkdirSync(lanesDir(projectRoot), { recursive: true });
  writeFileSync(
    laneConfigPath(projectRoot, id),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function readLaneRaw(projectRoot: string, id: string): unknown {
  const raw = readFileSync(laneConfigPath(projectRoot, id), 'utf8');
  return JSON.parse(raw);
}

function readLanePipelineTemplate(projectRoot: string, id: string): string {
  const parsed = readLaneRaw(projectRoot, id);
  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('pipelineTemplate' in parsed)
    || typeof (parsed as { pipelineTemplate: unknown }).pipelineTemplate !== 'string'
  ) {
    throw new Error(`lane ${id} on disk is missing string pipelineTemplate`);
  }
  return (parsed as { pipelineTemplate: string }).pipelineTemplate;
}

describe('deletePipeline atomic rollback on partial rebind (AUDIT-20260530-63)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-delete-atomic-reassign-'));
    mkdirSync(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('rolls back already-rebound lanes when a later lane write fails', async () => {
    writeDoomedOverride(projectRoot);

    // Lane `a` — valid, will be reassigned successfully on the first
    // pass.
    writeLane(projectRoot, 'a-lane', {
      id: 'a-lane',
      name: 'Lane A',
      pipelineTemplate: DOOMED_TEMPLATE.id,
    });

    // Lane `b` — valid config (passes loadLaneConfig in the
    // enumeration pass). To force the mid-batch commit to fail, we
    // pre-create the path commitLaneConfig writes to as a tmp file —
    // `<path>.<process.pid>.tmp` — as a DIRECTORY. When the rebind
    // loop calls commitLaneConfig for `b-lane`, the underlying
    // writeFileSync hits EISDIR and throws, surfacing the mid-batch
    // failure shape this test pins.
    writeLane(projectRoot, 'b-lane', {
      id: 'b-lane',
      name: 'Lane B',
      pipelineTemplate: DOOMED_TEMPLATE.id,
    });
    const bLaneTmpBlocker = `${laneConfigPath(projectRoot, 'b-lane')}.${process.pid}.tmp`;
    mkdirSync(bLaneTmpBlocker, { recursive: true });

    // Lane `c` — valid, must remain untouched (never reached).
    writeLane(projectRoot, 'c-lane', {
      id: 'c-lane',
      name: 'Lane C',
      pipelineTemplate: DOOMED_TEMPLATE.id,
    });

    await expect(
      deletePipeline(projectRoot, {
        id: DOOMED_TEMPLATE.id,
        reassignLanesTo: 'editorial',
      }),
    ).rejects.toThrow();

    // Override must still exist (rebind failed before unlink).
    expect(existsSync(pipelineOverridePath(projectRoot, DOOMED_TEMPLATE.id))).toBe(true);

    // Lane `a` must be restored to its original pipelineTemplate
    // (this is the rollback invariant — without the fix, lane `a`
    // would carry the replacement template `editorial` while the
    // override is still on disk).
    expect(readLanePipelineTemplate(projectRoot, 'a-lane')).toBe(DOOMED_TEMPLATE.id);

    // Lane `c` must be untouched (never reached by the loop).
    expect(readLanePipelineTemplate(projectRoot, 'c-lane')).toBe(DOOMED_TEMPLATE.id);
  });

  it('happy path: rebinds all dependent lanes atomically when nothing fails', async () => {
    writeDoomedOverride(projectRoot);
    writeLane(projectRoot, 'a-lane', {
      id: 'a-lane',
      name: 'Lane A',
      pipelineTemplate: DOOMED_TEMPLATE.id,
    });
    writeLane(projectRoot, 'c-lane', {
      id: 'c-lane',
      name: 'Lane C',
      pipelineTemplate: DOOMED_TEMPLATE.id,
    });

    const result = await deletePipeline(projectRoot, {
      id: DOOMED_TEMPLATE.id,
      reassignLanesTo: 'editorial',
    });

    expect(result.reassignedLanes).toHaveLength(2);
    expect(existsSync(pipelineOverridePath(projectRoot, DOOMED_TEMPLATE.id))).toBe(false);
    expect(readLanePipelineTemplate(projectRoot, 'a-lane')).toBe('editorial');
    expect(readLanePipelineTemplate(projectRoot, 'c-lane')).toBe('editorial');
  });
});
