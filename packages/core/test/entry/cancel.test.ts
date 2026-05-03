import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cancelEntry } from '@/entry/cancel';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';

describe('cancelEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('cancels an Ideas entry, records priorStage', async () => {
    await writeSidecar(projectRoot, {
      uuid, slug: 'foo', title: 'Foo', keywords: [], source: 'manual',
      currentStage: 'Ideas', iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    });
    const r = await cancelEntry(projectRoot, { uuid, reason: 'rejected' });
    expect(r.toStage).toBe('Cancelled');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Cancelled');
    expect(sidecar.priorStage).toBe('Ideas');
  });
});
