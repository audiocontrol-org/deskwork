import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inductEntry } from '@/entry/induct';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';

describe('inductEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('inducts a Blocked entry back to Drafting; clears priorStage', async () => {
    await writeSidecar(projectRoot, {
      uuid, slug: 'foo', title: 'Foo', keywords: [], source: 'manual',
      currentStage: 'Blocked', priorStage: 'Drafting', iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    });
    const r = await inductEntry(projectRoot, { uuid, targetStage: 'Drafting' });
    expect(r.toStage).toBe('Drafting');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Drafting');
    expect(sidecar.priorStage).toBeUndefined();
  });

  it('refuses to induct to Blocked or Cancelled', async () => {
    await writeSidecar(projectRoot, {
      uuid, slug: 'foo', title: 'Foo', keywords: [], source: 'manual',
      currentStage: 'Drafting', iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    });
    await expect(
      inductEntry(projectRoot, { uuid, targetStage: 'Blocked' }),
    ).rejects.toThrow(/blockEntry/i);
    await expect(
      inductEntry(projectRoot, { uuid, targetStage: 'Cancelled' }),
    ).rejects.toThrow(/cancelEntry/i);
  });

  it('refuses when already at the target stage', async () => {
    await writeSidecar(projectRoot, {
      uuid, slug: 'foo', title: 'Foo', keywords: [], source: 'manual',
      currentStage: 'Drafting', iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    });
    await expect(
      inductEntry(projectRoot, { uuid, targetStage: 'Drafting' }),
    ).rejects.toThrow(/already at/i);
  });
});
