/**
 * listLanes graceful-degradation tests.
 *
 * AUDIT-20260530-57 (Task 0.33, graphical-entries). The loader's
 * `listLaneConfigs` deliberately tolerates corrupt JSON files (its
 * `isArchivedOnDisk` returns `false` on parse errors so the lane
 * still appears in the enumeration). The operation-layer `listLanes`
 * historically undid that tolerance by mapping each id through
 * `loadLaneConfig`, which throws on the malformed lane — so a single
 * `broken.json` aborted the entire enumeration and the operator
 * could not see any of their healthy lanes.
 *
 * The fix collects per-id load failures into a `malformed` channel
 * on the result, so healthy lanes still emit alongside a flagged
 * broken section.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listLanes } from '../../src/lanes/operations/list.ts';

function writeLane(
  projectRoot: string,
  id: string,
  payload: Record<string, unknown>,
): void {
  const dir = join(projectRoot, '.deskwork', 'lanes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function writeRawLane(
  projectRoot: string,
  id: string,
  rawJson: string,
): void {
  const dir = join(projectRoot, '.deskwork', 'lanes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), rawJson, 'utf8');
}

describe('listLanes — graceful degradation on malformed configs (AUDIT-20260530-57)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-list-lanes-graceful-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns 2 healthy lanes plus a malformed entry when one config is corrupt', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
    });
    writeLane(projectRoot, 'mockups', {
      id: 'mockups',
      name: 'Mockups',
      pipelineTemplate: 'editorial',
    });
    writeRawLane(projectRoot, 'broken', '{ not json');

    const result = listLanes(projectRoot);

    expect(result.lanes.map((l) => l.id).sort()).toEqual(['default', 'mockups']);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0].id).toBe('broken');
    expect(result.malformed[0].error).toMatch(/JSON|parse|broken/i);
  });

  it('returns all healthy lanes with empty malformed when no configs are corrupt', () => {
    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
    });

    const result = listLanes(projectRoot);

    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0].id).toBe('default');
    expect(result.malformed).toEqual([]);
  });

  it('does not throw when the only lane on disk is corrupt — emits empty lanes + 1 malformed', () => {
    writeRawLane(projectRoot, 'broken', '{ not json');

    const result = listLanes(projectRoot);

    expect(result.lanes).toEqual([]);
    expect(result.malformed).toHaveLength(1);
    expect(result.malformed[0].id).toBe('broken');
  });

  it('returns empty lanes + empty malformed when no lane configs exist at all', () => {
    const result = listLanes(projectRoot);

    expect(result.lanes).toEqual([]);
    expect(result.malformed).toEqual([]);
  });
});
