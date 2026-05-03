import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@/sidecar/write';
import { resolveEntryUuid } from '@/sidecar/lookup';
import type { Entry } from '@/schema/entry';

describe('resolveEntryUuid', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('resolves a slug to its uuid', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'my-article', title: 'X', keywords: [], source: 'manual',
      currentStage: 'Ideas', iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    expect(await resolveEntryUuid(projectRoot, 'my-article')).toBe(entry.uuid);
  });

  it('returns the uuid as-is if input is already a uuid', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(await resolveEntryUuid(projectRoot, uuid)).toBe(uuid);
  });

  it('throws when slug is not found', async () => {
    await expect(resolveEntryUuid(projectRoot, 'no-such-slug')).rejects.toThrow(/not found/);
  });
});
