/**
 * Regression test for AUDIT-20260530-58 (cross-model: AUDIT-BARRAGE-claude-P6-1).
 *
 * Surface: `packages/core/src/lanes/operations/move.ts:moveEntryToLane`.
 *
 * Pre-fix: when a sidecar lacks a `lane` field, `moveEntryToLane`
 * resolves `sourceLaneId = sidecar.lane ?? 'default'`, then calls
 * `loadLaneConfig('default', projectRoot)`. If no `default` lane
 * config exists (a real migration-window state — lanes are
 * project-owned with no plugin defaults), the throw reads
 * `Lane config "default" not found at ...` — naming the wrong
 * object. The operator asked to move a specific entry; the error
 * complains about a missing default lane config.
 *
 * Post-fix: when the `sidecar.lane` was undefined AND the implicit
 * `default` lane does not resolve, the error names the entry slug
 * and instructs the operator to run `/deskwork:doctor` first.
 * When `sidecar.lane` WAS set (explicit lane id that doesn't
 * resolve), a different error names the missing lane id.
 *
 * Per the project no-fallback rule, the function does NOT silently
 * use the project's `contentDir` — surfacing the migration gap is
 * the right answer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveEntryToLane } from '../../src/lanes/operations/move.ts';
import { lanesDir } from '../../src/lanes/loader.ts';
import { sidecarsDir } from '../../src/sidecar/paths.ts';
import type { Entry } from '../../src/schema/entry.ts';

const SAMPLE_UUID = '11111111-1111-4111-8111-111111111111';

function writeSidecarRaw(projectRoot: string, entry: Entry): void {
  const dir = sidecarsDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${entry.uuid}.json`),
    JSON.stringify(entry, null, 2),
    'utf8',
  );
}

function writeLane(projectRoot: string, id: string, payload: unknown): void {
  const dir = lanesDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(payload, null, 2),
    'utf8',
  );
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  const now = new Date().toISOString();
  const base: Entry = {
    uuid: SAMPLE_UUID,
    slug: 'pre-migration-entry',
    title: 'Pre-migration entry',
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: {},
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, ...overrides };
}

describe('moveEntryToLane — pre-migration sidecar (AUDIT-20260530-58)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-move-premig-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses with an entry-named error when sidecar.lane is undefined AND no default lane exists', async () => {
    // No lane configs on disk. Sidecar has no `lane` field — the
    // pre-migration state the finding catalogs.
    writeSidecarRaw(projectRoot, makeEntry());

    // Even though `qa` doesn't exist as a target either, the source
    // lane resolution fails first (and that is the failure mode the
    // operator currently sees, just with the wrong object named).
    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/cannot determine source lane for entry 'pre-migration-entry'/);
  });

  it('error message instructs the operator to run /deskwork:doctor first', async () => {
    writeSidecarRaw(projectRoot, makeEntry());

    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(/\/deskwork:doctor/);
  });

  it('refuses with a lane-named error when sidecar.lane was set explicitly to an unknown lane', async () => {
    // The sidecar names a specific lane that doesn't resolve. The
    // operator's intent is unambiguous here — they bound the entry to
    // `archived`, but `archived` isn't on disk. The error names the
    // missing lane id (not the entry, not the implicit default).
    writeSidecarRaw(
      projectRoot,
      makeEntry({ lane: 'archived' }),
    );

    await expect(
      moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' }),
    ).rejects.toThrow(
      /cannot move entry 'pre-migration-entry': declared source lane 'archived' is not a known lane/,
    );
  });

  it('error LEADS with the entry slug (not with "Lane config not found") so the operator sees the right object first', async () => {
    writeSidecarRaw(projectRoot, makeEntry());

    try {
      await moveEntryToLane(projectRoot, { uuid: SAMPLE_UUID, toLane: 'qa' });
      throw new Error('expected moveEntryToLane to throw');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The pre-fix error read `Lane config "default" not found at
      // ...` as its FIRST line — directing the operator's attention
      // to a phantom default lane they never tried to interact with.
      // Post-fix, the message LEADS with the entry slug + intent
      // (move). The underlying-error detail may still appear as a
      // suffix for debugging purposes; the leading framing is what
      // makes the message useful to the operator.
      expect(message).toMatch(
        /^cannot determine source lane for entry 'pre-migration-entry'/,
      );
    }
  });

  it('original move path still works when the default lane DOES exist and sidecar.lane is undefined', async () => {
    // The original migration-window contract: when `default` is
    // present, an entry without `lane` is treated as a member of
    // `default`. This negative test confirms the new error path does
    // not regress the happy-path behavior the docblock describes.
    //
    // Phase 39: lanes carry no contentDir; the move is metadata-only.
    // The artifact (project-root-relative `artifactPath`) stays put.
    const docsDir = join(projectRoot, 'docs');
    mkdirSync(docsDir, { recursive: true });

    writeLane(projectRoot, 'default', {
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
    });
    writeLane(projectRoot, 'qa', {
      id: 'qa',
      name: 'QA',
      pipelineTemplate: 'editorial',
    });

    // Write an artifact file on disk. The move requires it to EXIST but
    // does NOT relocate it.
    const artifactRel = 'docs/pre-migration-entry.md';
    writeFileSync(join(projectRoot, artifactRel), '# entry body\n', 'utf8');

    writeSidecarRaw(
      projectRoot,
      makeEntry({ artifactPath: artifactRel }),
    );

    const result = await moveEntryToLane(projectRoot, {
      uuid: SAMPLE_UUID,
      toLane: 'qa',
    });
    expect(result.fromLane).toBe('default');
    expect(result.toLane).toBe('qa');
    // The artifact stays where it was — location is the entry's property.
    expect(result.fromArtifactPath).toBe(join(projectRoot, artifactRel));
    expect(result.toArtifactPath).toBe(join(projectRoot, artifactRel));
  });
});
