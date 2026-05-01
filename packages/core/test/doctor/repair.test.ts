import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repairAll } from '@/doctor/repair';
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
});
