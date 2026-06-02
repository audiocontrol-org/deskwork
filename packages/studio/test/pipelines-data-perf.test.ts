/**
 * Performance-regression guard for `loadPipelinesPageData`
 * (AUDIT-20260530-65 — cross-model AUDIT-BARRAGE-claude-P6-2).
 *
 * The pre-fix shape (commit 2cdde80) walked every lane file ONCE PER
 * TEMPLATE via `findReferencingLanes`, producing N×M synchronous disk
 * reads + parses on the cold-path render. The fix (commit b068da6 —
 * Phase 6 Task 6.4 follow-up Fix 3) builds a single inverse map
 * `Map<templateId, laneId[]>` ONCE before iterating templates, turning
 * the inner per-template walk into an O(1) map lookup and shrinking
 * lane reads from N×M to M.
 *
 * This test is the regression guard: with N=3 project-override
 * templates + M=5 lanes, lane file reads must be ≤ M, not N×M=15.
 * A regression that re-introduces the per-template walk fails this
 * assertion immediately on the cold-path render. The assertion shape
 * is "strict equality if feasible, ≤ M otherwise" per the task brief;
 * the implementation visits each lane exactly once, so strict ===
 * is the right bound.
 *
 * Mechanism: vitest's `vi.mock('node:fs', factory)` wraps
 * `readFileSync` with a counter that filters for paths under the
 * fixture's `<projectRoot>/.deskwork/lanes/` directory. Other reads
 * (template JSON, plugin presets shipping with `@deskwork/core`,
 * etc.) are not lane reads and are excluded from the count — the
 * assertion is specifically about the N×M lane-re-read regression
 * shape, not a global IO budget.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

// readCalls is populated by the vi.mock factory below. The factory
// runs against the test file's module-load, so its closure outlives
// individual it() blocks; tests reset the array in beforeEach.
const readCalls: string[] = [];

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: (
      path: Parameters<typeof actual.readFileSync>[0],
      opts?: Parameters<typeof actual.readFileSync>[1],
    ) => {
      readCalls.push(String(path));
      return actual.readFileSync(path, opts);
    },
  };
});

// Import the SUT AFTER vi.mock so the mocked readFileSync is the one
// captured by the SUT's named import. Static imports are hoisted
// above vi.mock; explicit dynamic import below guarantees order.
async function loadSut() {
  return await import('../src/pages/pipelines/data.ts');
}

function writeLane(
  root: string,
  id: string,
  pipelineTemplate: string,
): void {
  const json = { id, name: id, pipelineTemplate, contentDir: id };
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(json, null, 2),
    'utf8',
  );
}

function writePipelineOverride(
  root: string,
  id: string,
  body: unknown,
): void {
  writeFileSync(
    join(root, '.deskwork', 'pipelines', `${id}.json`),
    JSON.stringify(body, null, 2),
    'utf8',
  );
}

describe('loadPipelinesPageData — lane-read perf regression (AUDIT-20260530-65)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-perf-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'pipelines'), { recursive: true });
    readCalls.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads each lane file at most once even with multiple referencing templates', async () => {
    // N = 3 project-override templates. Each override is named to
    // distinguish it from the 5 plugin presets; the overrides are
    // what makes lane-cross-referencing non-trivial.
    const templateIds = ['proj-a', 'proj-b', 'proj-c'];
    for (const id of templateIds) {
      writePipelineOverride(root, id, {
        id,
        name: id,
        description: `override ${id}`,
        linearStages: ['Ideas', 'Drafting', 'Final'],
        offPipelineStages: ['Cancelled'],
      });
    }

    // M = 5 lanes. Each lane references one of the project-override
    // templates so the test exercises the index lookup against every
    // template id; if any template were unreferenced the regression
    // could hide behind that template's empty-list lookup.
    const lanes: ReadonlyArray<readonly [string, string]> = [
      ['lane-1', 'proj-a'],
      ['lane-2', 'proj-b'],
      ['lane-3', 'proj-c'],
      ['lane-4', 'proj-a'],
      ['lane-5', 'proj-b'],
    ];
    for (const [laneId, pipelineId] of lanes) {
      writeLane(root, laneId, pipelineId);
    }

    const { loadPipelinesPageData } = await loadSut();
    const data = await loadPipelinesPageData(root);

    // Sanity: the returned shape is preserved.
    expect(data.totalLanes).toBe(5);
    const byId = new Map(data.rows.map((r) => [r.id, r]));
    expect(byId.get('proj-a')?.referencingLanes).toEqual(['lane-1', 'lane-4']);
    expect(byId.get('proj-b')?.referencingLanes).toEqual(['lane-2', 'lane-5']);
    expect(byId.get('proj-c')?.referencingLanes).toEqual(['lane-3']);

    // The regression guard: count reads of files under the fixture's
    // <projectRoot>/.deskwork/lanes/ directory. The N×M pre-fix
    // shape produced 15 such reads (3 templates × 5 lanes); the
    // fixed shape produces exactly 5 (each lane read once).
    const lanesDirPrefix = join(root, '.deskwork', 'lanes') + sep;
    const laneReadCount = readCalls.filter((p) =>
      p.startsWith(lanesDirPrefix),
    ).length;
    // Strict-equality bound: each of the 5 lane files is read exactly
    // once. Any regression that re-introduces per-template walking
    // makes this count climb toward N×M=15 and fails immediately.
    expect(laneReadCount).toBe(5);
    // Defense-in-depth: explicit upper bound at M so the failure
    // message names the M ceiling if the strict equality ever needs
    // to soften (e.g. if a future legitimate optimization caches at
    // a different layer and reads each lane zero times).
    expect(laneReadCount).toBeLessThanOrEqual(5);
  });
});
