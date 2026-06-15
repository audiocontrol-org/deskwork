/**
 * Unit tests for the lanes-page data layer (Phase 6 Task 6.3).
 *
 * Covers:
 *   - active + archived split (rows whose JSON carries `archivedAt`
 *     are routed to the archived bucket).
 *   - per-lane entry-count aggregation from sidecars.
 *   - unrouted-entry tally (entries with no `lane` field, or with a
 *     lane id that doesn't exist on disk).
 *   - available-templates enumeration (plugin presets visible to the
 *     project).
 *   - empty-project shape (no lanes, no entries → all zeros, no
 *     throws).
 *
 * Fixture project trees on disk per `.claude/rules/testing.md`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { loadLanesPageData } from '../../src/pages/lanes/data.ts';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    uuid: '11111111-1111-4111-8111-111111111111',
    slug: 'placeholder',
    title: 'Placeholder',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 0 },
    createdAt: '2026-05-28T10:00:00.000Z',
    updatedAt: '2026-05-28T10:00:00.000Z',
    ...overrides,
  };
}

function writeLane(
  root: string,
  id: string,
  name: string,
  pipelineTemplate: string,
  // Phase 39: a lane carries no contentDir; the dir lands under
  // scaffoldDefaults.markdown.
  scaffoldMarkdown: string,
  archivedAt?: string,
): void {
  const json: Record<string, unknown> = {
    id,
    name,
    pipelineTemplate,
    scaffoldDefaults: { markdown: scaffoldMarkdown },
  };
  if (archivedAt !== undefined) json.archivedAt = archivedAt;
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify(json, null, 2),
    'utf8',
  );
}

describe('loadLanesPageData', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-data-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns zeroed shape on an empty project (no lanes, no entries)', async () => {
    const data = await loadLanesPageData(root);
    expect(data.active).toEqual([]);
    expect(data.archived).toEqual([]);
    expect(data.totalEntries).toBe(0);
    expect(data.unroutedEntries).toBe(0);
    // Plugin presets ship with the @deskwork/core build; the enumerator
    // surfaces them even on an empty project. We only assert non-empty
    // here so the test doesn't couple to the exact preset list.
    expect(data.availableTemplates.length).toBeGreaterThan(0);
  });

  it('routes active vs archived lanes by archivedAt presence', async () => {
    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
    writeLane(
      root,
      'old-lane',
      'Old',
      'editorial',
      'docs-old',
      '2026-04-01T10:00:00.000Z',
    );

    const data = await loadLanesPageData(root);
    expect(data.active.map((r) => r.id)).toEqual(['editorial-lane']);
    expect(data.archived.map((r) => r.id)).toEqual(['old-lane']);
    expect(data.active[0].archived).toBe(false);
    expect(data.archived[0].archived).toBe(true);
    expect(data.archived[0].archivedAt).toBe('2026-04-01T10:00:00.000Z');
  });

  it('aggregates per-lane entry counts from sidecars', async () => {
    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
    writeLane(root, 'visual-lane', 'Visual', 'visual', 'mockups');

    await writeSidecar(
      root,
      makeEntry({
        uuid: '11111111-1111-4111-8111-111111111111',
        slug: 'a',
        lane: 'editorial-lane',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: '22222222-2222-4222-8222-222222222222',
        slug: 'b',
        lane: 'editorial-lane',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: '33333333-3333-4333-8333-333333333333',
        slug: 'c',
        lane: 'visual-lane',
        currentStage: 'Sketched',
        iterationByStage: { Sketched: 0 },
      }),
    );

    const data = await loadLanesPageData(root);
    const byId = new Map(data.active.map((r) => [r.id, r]));
    expect(byId.get('editorial-lane')?.entryCount).toBe(2);
    expect(byId.get('visual-lane')?.entryCount).toBe(1);
    expect(data.totalEntries).toBe(3);
    expect(data.unroutedEntries).toBe(0);
  });

  it('counts entries with no lane field as unrouted', async () => {
    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
    await writeSidecar(
      root,
      makeEntry({
        uuid: '11111111-1111-4111-8111-111111111111',
        slug: 'no-lane-1',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: '22222222-2222-4222-8222-222222222222',
        slug: 'with-lane',
        lane: 'editorial-lane',
      }),
    );

    const data = await loadLanesPageData(root);
    expect(data.unroutedEntries).toBe(1);
    expect(data.active[0].entryCount).toBe(1);
  });

  it('counts entries whose lane references a missing lane as unrouted', async () => {
    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
    await writeSidecar(
      root,
      makeEntry({
        uuid: '11111111-1111-4111-8111-111111111111',
        slug: 'orphan',
        lane: 'does-not-exist',
      }),
    );

    const data = await loadLanesPageData(root);
    expect(data.unroutedEntries).toBe(1);
    expect(data.totalEntries).toBe(1);
  });

  it('routes entry counts to archived lanes too (archived lanes still own their entries)', async () => {
    writeLane(
      root,
      'archived-lane',
      'Archived',
      'editorial',
      'docs-archived',
      '2026-04-01T10:00:00.000Z',
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: '11111111-1111-4111-8111-111111111111',
        slug: 'in-archived',
        lane: 'archived-lane',
      }),
    );

    const data = await loadLanesPageData(root);
    expect(data.archived[0].entryCount).toBe(1);
    expect(data.unroutedEntries).toBe(0);
  });

  it('preserves the lane fields in each row', async () => {
    writeLane(root, 'editorial-lane', 'Editorial', 'editorial', 'docs');
    const data = await loadLanesPageData(root);
    const row = data.active[0];
    expect(row.id).toBe('editorial-lane');
    expect(row.name).toBe('Editorial');
    expect(row.pipelineTemplate).toBe('editorial');
    // Phase 39: a lane row exposes scaffoldDefaults (+ host), not contentDir.
    expect(row.scaffoldDefaults).toEqual({ markdown: 'docs' });
    expect(row.host).toBeNull();
  });
});
