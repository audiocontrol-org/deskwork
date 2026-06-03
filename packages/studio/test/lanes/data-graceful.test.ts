/**
 * Unit tests for graceful degradation in the lanes-page data layer
 * (Task 0.41 — closes AUDIT-20260530-66 / cross-model
 * AUDIT-BARRAGE-claude-P6-2).
 *
 * Coverage:
 *   - `loadLanesPageData` does NOT throw when one (or more) lane
 *     configs are malformed. The page must keep rendering the healthy
 *     lanes; one bad lane cannot blind the operator to the rest.
 *   - Malformed lanes surface on a `malformed: LaneErrorRow[]` channel
 *     mirroring the pipelines page's `errors` channel (classified by
 *     `kind`, with `path` + verbatim `message`).
 *   - Healthy lanes still appear in `active` / `archived`.
 *   - Error kinds classify correctly against the loader's stable error
 *     strings: parse / zod / id-mismatch / pipeline-resolve / missing /
 *     unknown.
 *
 * Mirrors the pipelines-page precedent in
 * `packages/studio/test/pipelines/data.test.ts` (the surface this
 * lanes page should match per AUDIT-20260530-66).
 *
 * Fixture project trees on disk per `.claude/rules/testing.md`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLanesPageData } from '../../src/pages/lanes/data.ts';

function writeLaneJson(root: string, id: string, body: unknown): void {
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    'utf8',
  );
}

function writeHealthyLane(
  root: string,
  id: string,
  pipelineTemplate: string,
): void {
  writeLaneJson(root, id, {
    id,
    name: id,
    pipelineTemplate,
    scaffoldDefaults: { markdown: id },
  });
}

describe('loadLanesPageData — graceful degradation on malformed lane config', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-graceful-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('does NOT throw when one lane has malformed JSON; healthy lanes still render', async () => {
    writeHealthyLane(root, 'editorial-lane', 'editorial');
    writeHealthyLane(root, 'visual-lane', 'visual');
    writeLaneJson(root, 'broken-lane', '{ this is not valid json');

    // The whole point of the fix: this call must not throw. Pre-fix it
    // throws because `loadLaneConfig('broken-lane', ...)` raises and no
    // try/catch wraps the loop.
    const data = await loadLanesPageData(root);

    expect(data.active.map((r) => r.id).sort()).toEqual([
      'editorial-lane',
      'visual-lane',
    ]);
    expect(data.malformed.map((r) => r.id)).toEqual(['broken-lane']);
    expect(data.malformed[0].error.kind).toBe('parse');
    expect(data.malformed[0].error.path).toBe(
      join(root, '.deskwork', 'lanes', 'broken-lane.json'),
    );
    expect(data.malformed[0].error.message).toContain('not valid JSON');
  });

  it('classifies a Zod-invalid lane as kind=zod', async () => {
    writeHealthyLane(root, 'editorial-lane', 'editorial');
    // Schema-invalid: name is required (non-empty string)
    writeLaneJson(root, 'noname-lane', {
      id: 'noname-lane',
      pipelineTemplate: 'editorial',
    });

    const data = await loadLanesPageData(root);
    expect(data.active.map((r) => r.id)).toEqual(['editorial-lane']);
    const err = data.malformed.find((m) => m.id === 'noname-lane');
    expect(err).toBeDefined();
    expect(err!.error.kind).toBe('zod');
    expect(err!.error.message).toContain('failed Zod validation');
  });

  it('classifies an id-mismatch lane as kind=id-mismatch', async () => {
    writeHealthyLane(root, 'editorial-lane', 'editorial');
    writeLaneJson(root, 'on-disk-name', {
      id: 'inside-name',
      name: 'Misnamed',
      pipelineTemplate: 'editorial',
    });

    const data = await loadLanesPageData(root);
    expect(data.active.map((r) => r.id)).toEqual(['editorial-lane']);
    const err = data.malformed.find((m) => m.id === 'on-disk-name');
    expect(err).toBeDefined();
    expect(err!.error.kind).toBe('id-mismatch');
  });

  it('classifies a lane whose pipelineTemplate does not resolve as kind=pipeline-resolve', async () => {
    writeHealthyLane(root, 'editorial-lane', 'editorial');
    writeLaneJson(root, 'orphan-pipeline-lane', {
      id: 'orphan-pipeline-lane',
      name: 'Orphan',
      pipelineTemplate: 'does-not-exist',
    });

    const data = await loadLanesPageData(root);
    expect(data.active.map((r) => r.id)).toEqual(['editorial-lane']);
    const err = data.malformed.find((m) => m.id === 'orphan-pipeline-lane');
    expect(err).toBeDefined();
    expect(err!.error.kind).toBe('pipeline-resolve');
  });

  it('surfaces multiple malformed lanes simultaneously without losing any healthy ones', async () => {
    writeHealthyLane(root, 'editorial-lane', 'editorial');
    writeLaneJson(root, 'broken-a', '{ not json');
    writeLaneJson(root, 'broken-b', '{ also not json');
    writeHealthyLane(root, 'visual-lane', 'visual');

    const data = await loadLanesPageData(root);
    expect(data.active.map((r) => r.id).sort()).toEqual([
      'editorial-lane',
      'visual-lane',
    ]);
    expect(data.malformed.map((m) => m.id).sort()).toEqual([
      'broken-a',
      'broken-b',
    ]);
  });

  it('returns an empty malformed list on a healthy project (does not surface false positives)', async () => {
    writeHealthyLane(root, 'editorial-lane', 'editorial');

    const data = await loadLanesPageData(root);
    expect(data.malformed).toEqual([]);
    expect(data.active.map((r) => r.id)).toEqual(['editorial-lane']);
  });
});
