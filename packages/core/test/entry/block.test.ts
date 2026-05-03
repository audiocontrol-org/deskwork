import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blockEntry } from '@/entry/block';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { readJournalEvents } from '@/journal/read';
import type { Entry } from '@/schema/entry';

describe('blockEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setup(stage: Entry['currentStage']): Promise<void> {
    await writeSidecar(projectRoot, {
      uuid, slug: 'foo', title: 'Foo', keywords: [], source: 'manual',
      currentStage: stage, iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    });
  }

  it('blocks a Drafting entry, records priorStage, emits stage-transition event', async () => {
    await setup('Drafting');
    const r = await blockEntry(projectRoot, { uuid, reason: 'awaiting research' });
    expect(r.fromStage).toBe('Drafting');
    expect(r.toStage).toBe('Blocked');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Blocked');
    expect(sidecar.priorStage).toBe('Drafting');

    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const transition = events.find((e) => e.kind === 'stage-transition');
    expect(transition).toBeDefined();
    if (transition && transition.kind === 'stage-transition') {
      expect(transition.from).toBe('Drafting');
      expect(transition.to).toBe('Blocked');
      expect(transition.reason).toBe('awaiting research');
    }
  });

  it('refuses Published / Blocked / Cancelled', async () => {
    for (const stage of ['Published'] as const) {
      await setup(stage);
      await expect(blockEntry(projectRoot, { uuid })).rejects.toThrow();
    }
  });
});
