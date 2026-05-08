/**
 * Phase 34a — history-journal reader (T3).
 *
 * Drives `iterateEntry` to produce real iteration events on disk, then
 * verifies `listEntryIterations` / `getEntryIteration` project them
 * correctly. Mirrors the fixture setup in `iterate/iterate.test.ts`.
 *
 * Post-T1 (Issue #222): iterate always reads index.md regardless of
 * stage; per-stage files (idea.md / plan.md / outline.md / drafting.md)
 * are scrapbook snapshots produced by approveEntryStage, not iterate's
 * read target. These tests write to index.md and rely on the snapshot
 * machinery (in approveEntryStage) being separately tested.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iterateEntry } from '@/iterate/iterate';
import { listEntryIterations, getEntryIteration } from '@/iterate/history';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

async function setupProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dw-iterate-history-'));
  await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
  await writeFile(
    join(root, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
      defaultSite: 'main',
    }),
  );
  return root;
}

async function setupEntry(
  root: string,
  uuid: string,
  slug: string,
  stage: Entry['currentStage'],
): Promise<void> {
  await mkdir(join(root, 'docs', slug), { recursive: true });
  const e: Entry = {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: stage === 'Ideas' ? {} : { Ideas: 1 },
    // T1 — index.md is the canonical artifact.
    artifactPath: `docs/${slug}/index.md`,
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
  };
  await writeSidecar(root, e);
}

describe('iterate history reader', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns an empty list for an entry with no iterations', async () => {
    const out = await listEntryIterations(root, UUID_A);
    expect(out).toEqual([]);
  });

  it('returns an empty list when the journal directory does not exist', async () => {
    const noJournalRoot = await mkdtemp(join(tmpdir(), 'dw-iterate-history-empty-'));
    try {
      const out = await listEntryIterations(noJournalRoot, UUID_A);
      expect(out).toEqual([]);
    } finally {
      await rm(noJournalRoot, { recursive: true, force: true });
    }
  });

  it('lists iterations for a multi-version entry in chronological order', async () => {
    await setupEntry(root, UUID_A, 'a', 'Ideas');
    const indexPath = join(root, 'docs', 'a', 'index.md');

    await writeFile(indexPath, `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# v1 body\n`);
    await iterateEntry(root, { uuid: UUID_A });

    await writeFile(indexPath, `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# v2 body\n`);
    await iterateEntry(root, { uuid: UUID_A });

    await writeFile(indexPath, `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# v3 body\n`);
    await iterateEntry(root, { uuid: UUID_A });

    const listing = await listEntryIterations(root, UUID_A);
    expect(listing).toHaveLength(3);
    expect(listing.map((x) => x.versionNumber)).toEqual([1, 2, 3]);
    expect(listing.every((x) => x.stage === 'Ideas')).toBe(true);
    // Timestamps must be non-decreasing.
    for (let i = 1; i < listing.length; i++) {
      expect(listing[i].timestamp >= listing[i - 1].timestamp).toBe(true);
    }
  });

  it('does not leak iterations across entries', async () => {
    await setupEntry(root, UUID_A, 'a', 'Ideas');
    await setupEntry(root, UUID_B, 'b', 'Ideas');
    const aPath = join(root, 'docs', 'a', 'index.md');
    const bPath = join(root, 'docs', 'b', 'index.md');
    await writeFile(aPath, `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# A body\n`);
    await iterateEntry(root, { uuid: UUID_A });
    await writeFile(bPath, `---\ndeskwork:\n  id: ${UUID_B}\n---\n\n# B body\n`);
    await iterateEntry(root, { uuid: UUID_B });

    const onA = await listEntryIterations(root, UUID_A);
    const onB = await listEntryIterations(root, UUID_B);
    expect(onA).toHaveLength(1);
    expect(onB).toHaveLength(1);
  });

  it('getEntryIteration returns the markdown captured at the requested version', async () => {
    await setupEntry(root, UUID_A, 'a', 'Ideas');
    const indexPath = join(root, 'docs', 'a', 'index.md');

    const v1Body = `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# version one\n`;
    const v2Body = `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# version two\n`;
    await writeFile(indexPath, v1Body);
    await iterateEntry(root, { uuid: UUID_A });
    await writeFile(indexPath, v2Body);
    await iterateEntry(root, { uuid: UUID_A });

    const got1 = await getEntryIteration(root, UUID_A, 1);
    expect(got1).not.toBeNull();
    expect(got1?.markdown).toContain('# version one');
    expect(got1?.versionNumber).toBe(1);
    expect(got1?.stage).toBe('Ideas');

    const got2 = await getEntryIteration(root, UUID_A, 2);
    expect(got2).not.toBeNull();
    expect(got2?.markdown).toContain('# version two');
  });

  it('getEntryIteration returns null for an unknown version', async () => {
    await setupEntry(root, UUID_A, 'a', 'Ideas');
    const indexPath = join(root, 'docs', 'a', 'index.md');
    await writeFile(indexPath, `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# only v1\n`);
    await iterateEntry(root, { uuid: UUID_A });

    const got = await getEntryIteration(root, UUID_A, 999);
    expect(got).toBeNull();
  });

  it('getEntryIteration returns null when the entry has no iterations at all', async () => {
    const got = await getEntryIteration(root, UUID_A, 1);
    expect(got).toBeNull();
  });

  it('getEntryIteration disambiguates by stage when provided', async () => {
    // Build an entry with iteration v1 in two distinct stages by:
    //  - iterate at Ideas (writes v1)
    //  - manually flip sidecar to Planned (avoid approveEntryStage
    //    dependency — this test scopes to history.ts behavior)
    //  - iterate at Planned (writes v1 because Planned starts at 0)
    await setupEntry(root, UUID_A, 'a', 'Ideas');
    const indexPath = join(root, 'docs', 'a', 'index.md');

    await writeFile(indexPath, `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# IDEAS body\n`);
    await iterateEntry(root, { uuid: UUID_A });

    const { readSidecar } = await import('@/sidecar/read');
    const s = await readSidecar(root, UUID_A);
    await writeSidecar(root, { ...s, currentStage: 'Planned' });

    // Same index.md (single document evolves) — body changes between
    // stages, but the file is the same. The journal records distinct
    // versions per (entryId, stage) tuple.
    await writeFile(indexPath, `---\ndeskwork:\n  id: ${UUID_A}\n---\n\n# PLANNED body\n`);
    await iterateEntry(root, { uuid: UUID_A });

    const allV1 = await listEntryIterations(root, UUID_A);
    const v1s = allV1.filter((x) => x.versionNumber === 1);
    expect(v1s).toHaveLength(2);

    const ideasV1 = await getEntryIteration(root, UUID_A, 1, 'Ideas');
    expect(ideasV1?.markdown).toContain('IDEAS body');
    const plannedV1 = await getEntryIteration(root, UUID_A, 1, 'Planned');
    expect(plannedV1?.markdown).toContain('PLANNED body');

    // Without stage, the chronologically first match wins (Ideas).
    const undisambiguated = await getEntryIteration(root, UUID_A, 1);
    expect(undisambiguated?.stage).toBe('Ideas');
  });
});
