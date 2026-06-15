import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repairAll } from '@/doctor/repair';
import { readSidecar } from '@/sidecar/read';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

describe('repairAll - calendar regeneration', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
        defaultSite: 'main',
      }),
    );
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('regenerates calendar.md from sidecars', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x', title: 'X', keywords: [], source: 'manual',
      currentStage: 'Drafting', iterationByStage: { Drafting: 3 },
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    const result = await repairAll(projectRoot, { destructive: false });
    expect(result.applied).toContain('calendar-regenerated');
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    expect(md).toContain('## Drafting');
    expect(md).toContain('x');
  });

  /**
   * Phase 39d (sites→lanes retirement): the runtime artifactPath
   * backfiller is REMOVED from `repair.ts`. `repairAll` no longer
   * derives a path from the slug+stage heuristic — it reads stored paths
   * only and regenerates the calendar. Backfilling missing artifactPath
   * is owned by the 39b migration (`sites-migration-backfill.ts`), which
   * enumerates candidates across legacy content dirs and halts on
   * ambiguity. Those backfill semantics are tested in
   * `sites-to-lanes-migration.test.ts` + `migration-slug-collision.test.ts`.
   *
   * This regression locks in that `repairAll` does NOT touch
   * `artifactPath`, even when a path-less sidecar has a file sitting at
   * the old heuristic location.
   */
  it('does NOT backfill artifactPath (heuristic backfill moved to the 39b migration)', async () => {
    const entry: Entry = {
      uuid: '660e8400-e29b-41d4-a716-446655440001',
      slug: 'plan-doc',
      title: 'Plan Doc',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      // artifactPath INTENTIONALLY OMITTED — older entry shape.
    };
    await writeSidecar(projectRoot, entry);
    // Seed a file at the OLD heuristic location. repairAll must NOT
    // stamp artifactPath from it — that backfill is the migration's job.
    await mkdir(join(projectRoot, 'docs', 'plan-doc'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'plan-doc', 'index.md'), '# Plan Doc\n\nbody\n');

    const result = await repairAll(projectRoot, { destructive: false });
    // Calendar still regenerates; no artifact-path-backfill happens.
    expect(result.applied).toContain('calendar-regenerated');
    expect(result.applied.some((a) => a.startsWith('artifact-path-backfilled'))).toBe(false);

    const updated = await readSidecar(projectRoot, entry.uuid);
    expect(updated.artifactPath).toBeUndefined();
  });
});
