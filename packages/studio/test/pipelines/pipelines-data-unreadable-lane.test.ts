/**
 * Regression test for AUDIT-20260530-67 (cross-model:
 * AUDIT-BARRAGE-claude-P6-2).
 *
 * Bug shape: `readLanePipelineTemplate` returned `null` on read /
 * parse / field failure; `buildLaneRefIndex` treated `null` as "no
 * reference here." Result: a lane whose JSON is corrupt but which
 * may reference template X is silently excluded from X's
 * `referencingLanes`. The pipelines table then rendered an ACTIVE
 * Delete button for X, telling the operator X is safe to delete
 * when an unreadable (possibly-referencing) lane existed.
 *
 * Fix: distinguish missing-on-disk (ENOENT → genuinely no reference)
 * from parse / read / shape failure (unknown-but-possibly-referencing).
 * Surface unreadable lanes as a separate `unreadableLaneCount` channel
 * on every pipeline row + on the page-level data shape. Delete button
 * disables when `referencingLanes.length > 0` OR
 * `unreadableLaneCount > 0`.
 *
 * Fixture-on-disk per `.claude/rules/testing.md`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPipelinesPageData } from '../../src/pages/pipelines/data.ts';
import { renderPipelineTable } from '../../src/pages/pipelines/table.ts';

function writeLane(
  root: string,
  id: string,
  pipelineTemplate: string,
): void {
  const json = {
    id,
    name: id,
    pipelineTemplate,
    contentDir: id,
  };
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(json, null, 2),
    'utf8',
  );
}

function writeCorruptLane(root: string, id: string): void {
  // Valid file on disk, but JSON.parse throws → "unreadable" channel.
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    '{ this is not valid json',
    'utf8',
  );
}

describe('loadPipelinesPageData — unreadable lanes (AUDIT-20260530-67)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-unreadable-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('counts unreadable lanes into a separate unreadableLaneCount channel — does NOT silently drop them', async () => {
    // Two healthy lanes referencing `editorial`, plus one corrupt
    // lane whose JSON we cannot parse. The corrupt lane MIGHT
    // reference any template — we cannot know — so the safe posture
    // is to count it as unknown.
    writeLane(root, 'healthy-a', 'editorial');
    writeLane(root, 'healthy-b', 'editorial');
    writeCorruptLane(root, 'corrupt');

    const data = await loadPipelinesPageData(root);

    expect(data.unreadableLaneCount).toBe(1);
    // The healthy lanes still show up correctly under `editorial`.
    const editorial = data.rows.find((r) => r.id === 'editorial');
    expect(editorial).toBeDefined();
    expect(editorial!.referencingLanes).toEqual(['healthy-a', 'healthy-b']);
    // Every row is annotated with the page-level count so the
    // renderer can gate the Delete button without an extra parameter.
    expect(editorial!.unreadableLaneCount).toBe(1);
    const visual = data.rows.find((r) => r.id === 'visual');
    expect(visual?.unreadableLaneCount).toBe(1);
  });

  it('Delete button is DISABLED when unreadable lanes exist even if referencingLanes is empty', async () => {
    // One corrupt lane, one project-override pipeline with NO known
    // references. Without the fix: Delete button is active (the gate
    // only checks `referencingLanes.length`). With the fix: Delete is
    // disabled — the corrupt lane MIGHT reference the override.
    writeFileSync(
      join(root, '.deskwork', 'pipelines', 'custom.json'),
      JSON.stringify(
        {
          id: 'custom',
          name: 'Custom',
          description: 'project-local',
          linearStages: ['Idea', 'Done'],
          offPipelineStages: ['Cancelled'],
        },
        null,
        2,
      ),
      'utf8',
    );
    writeCorruptLane(root, 'corrupt');

    const data = await loadPipelinesPageData(root);
    const custom = data.rows.find((r) => r.id === 'custom');
    expect(custom).toBeDefined();
    expect(custom!.referencingLanes).toEqual([]);
    expect(custom!.unreadableLaneCount).toBe(1);

    const tableHtml = renderPipelineTable({
      rows: data.rows,
      errors: data.errors,
    }).__raw;

    // Assert the Delete button for `custom` renders in the disabled
    // variant — same class as the other disabled gates — and the
    // title explains the unreadable-lane situation.
    expect(tableHtml).toMatch(
      /data-pipeline-id="custom"[^]*?pipelines-btn--delete-disabled[^]*?unreadable/i,
    );
    // And the disabled state carries no data-copy.
    expect(tableHtml).not.toContain('data-copy="/deskwork:pipeline delete custom"');
  });

  it('lanes that exist but are missing-on-disk (no file at all) are NOT counted as unreadable', async () => {
    // No lanes written. The pipelines page surveys NO lane ids
    // (listLaneConfigs returns []), so `unreadableLaneCount` stays 0.
    // This pins the missing-vs-unreadable distinction the fix
    // introduces — ENOENT during the listing step is "genuinely no
    // reference," not "unknown-possibly-referencing."
    const data = await loadPipelinesPageData(root);
    expect(data.unreadableLaneCount).toBe(0);
    const editorial = data.rows.find((r) => r.id === 'editorial');
    expect(editorial?.unreadableLaneCount).toBe(0);
    expect(editorial?.referencingLanes).toEqual([]);
  });

  it('two corrupt lanes are counted as 2; the count surfaces on every row', async () => {
    writeCorruptLane(root, 'corrupt-1');
    writeCorruptLane(root, 'corrupt-2');

    const data = await loadPipelinesPageData(root);
    expect(data.unreadableLaneCount).toBe(2);
    for (const row of data.rows) {
      expect(row.unreadableLaneCount).toBe(2);
    }
  });
});
