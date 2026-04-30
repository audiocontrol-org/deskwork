import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSidecar, sidecarPath } from '@/sidecar';

describe('sidecar paths', () => {
  it('returns the canonical sidecar path', () => {
    expect(sidecarPath('/proj', '550e8400-e29b-41d4-a716-446655440000'))
      .toBe('/proj/.deskwork/entries/550e8400-e29b-41d4-a716-446655440000.json');
  });
});

describe('readSidecar', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('reads + parses a valid sidecar', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const entry = {
      uuid,
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeFile(sidecarPath(projectRoot, uuid), JSON.stringify(entry, null, 2));

    const result = await readSidecar(projectRoot, uuid);
    expect(result.uuid).toBe(uuid);
    expect(result.currentStage).toBe('Ideas');
  });

  it('throws on missing sidecar', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440099';
    await expect(readSidecar(projectRoot, uuid)).rejects.toThrow(/sidecar not found/);
  });

  it('throws on schema-invalid sidecar', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    await writeFile(sidecarPath(projectRoot, uuid), JSON.stringify({ uuid, currentStage: 'NotAStage' }));
    await expect(readSidecar(projectRoot, uuid)).rejects.toThrow(/schema/);
  });
});
