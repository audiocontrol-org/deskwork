import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar, readSidecar } from '@/sidecar';
import type { Entry } from '@/schema/entry';

describe('writeSidecar', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('writes a sidecar that round-trips through readSidecar', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    const read = await readSidecar(projectRoot, entry.uuid);
    expect(read).toEqual(entry);
  });

  it('creates the .deskwork/entries directory if missing', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440001',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    const read = await readSidecar(projectRoot, entry.uuid);
    expect(read.uuid).toBe(entry.uuid);
  });

  it('rejects schema-invalid entries before writing', async () => {
    const invalid = {
      uuid: 'not-a-uuid',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    // @ts-expect-error — intentional invalid input
    await expect(writeSidecar(projectRoot, invalid)).rejects.toThrow(/schema/);
  });
});
