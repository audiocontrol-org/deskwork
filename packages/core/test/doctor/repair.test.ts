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
   * #182 Phase 34 ship-pass — backfill artifactPath when the sidecar
   * lacks the field but the slug+stage heuristic resolves to a real
   * file.
   */
  it('backfills artifactPath on sidecars that lack the field but where the heuristic resolves', async () => {
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
    // Seed the file at the heuristic location for Drafting stage:
    // docs/<slug>/index.md.
    const heuristicPath = join(projectRoot, 'docs', 'plan-doc', 'index.md');
    await mkdir(join(projectRoot, 'docs', 'plan-doc'), { recursive: true });
    await writeFile(heuristicPath, '# Plan Doc\n\nbody\n');

    const result = await repairAll(projectRoot, { destructive: false });
    expect(result.applied.some((a) => a.startsWith('artifact-path-backfilled'))).toBe(true);

    const updated = await readSidecar(projectRoot, entry.uuid);
    expect(updated.artifactPath).toBe('docs/plan-doc/index.md');
  });

  it('does NOT backfill when the heuristic file is missing', async () => {
    const entry: Entry = {
      uuid: '770e8400-e29b-41d4-a716-446655440002',
      slug: 'no-file',
      title: 'No File',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    // No file seeded at docs/no-file/index.md.

    const result = await repairAll(projectRoot, { destructive: false });
    // calendar still regenerates, but no backfill applied.
    expect(result.applied).toContain('calendar-regenerated');
    expect(result.applied.some((a) => a.startsWith('artifact-path-backfilled'))).toBe(false);

    // Sidecar artifactPath stays unset — no field added when the
    // heuristic doesn't resolve to an existing file.
    const updated = await readSidecar(projectRoot, entry.uuid);
    expect(updated.artifactPath).toBeUndefined();
  });

  it('is idempotent — re-running on already-backfilled sidecars is a no-op', async () => {
    const entry: Entry = {
      uuid: '880e8400-e29b-41d4-a716-446655440003',
      slug: 'already-stamped',
      title: 'Already Stamped',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 1 },
      artifactPath: 'docs/already-stamped/index.md',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    await mkdir(join(projectRoot, 'docs', 'already-stamped'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'already-stamped', 'index.md'), '# x\n');

    const result = await repairAll(projectRoot, { destructive: false });
    expect(result.applied.some((a) => a.startsWith('artifact-path-backfilled'))).toBe(false);
  });
});
