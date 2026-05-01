import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAllSidecars, sidecarPath, writeSidecar } from '@/sidecar';
import type { Entry } from '@/schema/entry';

const UUID_A = '550e8400-e29b-41d4-a716-446655440000';
const UUID_B = '550e8400-e29b-41d4-a716-446655440001';

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: UUID_A,
    slug: 'a',
    title: 'A',
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: { Ideas: 1 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('readAllSidecars', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns an empty array when the entries dir does not exist', async () => {
    const result = await readAllSidecars(projectRoot);
    expect(result).toEqual([]);
  });

  it('returns an empty array when the entries dir is empty', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    const result = await readAllSidecars(projectRoot);
    expect(result).toEqual([]);
  });

  it('returns every parsed sidecar', async () => {
    await writeSidecar(projectRoot, makeEntry({ uuid: UUID_A, slug: 'a' }));
    await writeSidecar(projectRoot, makeEntry({ uuid: UUID_B, slug: 'b', currentStage: 'Drafting', iterationByStage: { Drafting: 2 } }));

    const result = await readAllSidecars(projectRoot);
    const slugs = result.map((e) => e.slug).sort();
    expect(slugs).toEqual(['a', 'b']);
  });

  it('skips non-json files in the entries directory', async () => {
    await writeSidecar(projectRoot, makeEntry({ uuid: UUID_A, slug: 'a' }));
    // A stray non-json file (e.g., editor backup) shouldn't break the read.
    await writeFile(join(projectRoot, '.deskwork', 'entries', 'README.md'), '# notes\n');

    const result = await readAllSidecars(projectRoot);
    expect(result.length).toBe(1);
    expect(result[0].slug).toBe('a');
  });

  it('throws on schema-invalid sidecar (does not silently skip)', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await writeFile(
      sidecarPath(projectRoot, UUID_A),
      JSON.stringify({ uuid: UUID_A, currentStage: 'NotAStage' }),
    );
    await expect(readAllSidecars(projectRoot)).rejects.toThrow(/schema invalid/);
  });

  it('throws on JSON-invalid sidecar (does not silently skip)', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await writeFile(sidecarPath(projectRoot, UUID_A), '{not json');
    await expect(readAllSidecars(projectRoot)).rejects.toThrow(/JSON invalid/);
  });
});
