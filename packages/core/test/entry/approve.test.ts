import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approveEntryStage } from '@/entry/approve';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { readJournalEvents } from '@/journal/read';
import type { Entry } from '@/schema/entry';

describe('approveEntryStage', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setupEntry(overrides: Partial<Entry>): Promise<Entry> {
    const entry: Entry = {
      uuid,
      slug: 'foo',
      title: 'Foo',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      ...overrides,
    };
    await writeSidecar(projectRoot, entry);
    return entry;
  }

  it('graduates Ideas → Planned', async () => {
    await setupEntry({ currentStage: 'Ideas' });
    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.fromStage).toBe('Ideas');
    expect(result.toStage).toBe('Planned');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Planned');
  });

  it('graduates Drafting → Final', async () => {
    await setupEntry({ currentStage: 'Drafting', reviewState: 'in-review' });
    const result = await approveEntryStage(projectRoot, { uuid });
    expect(result.toStage).toBe('Final');
    const sidecar = await readSidecar(projectRoot, uuid);
    expect(sidecar.currentStage).toBe('Final');
    // reviewState clears on stage transition.
    expect(sidecar.reviewState).toBeUndefined();
  });

  it('emits a stage-transition journal event', async () => {
    await setupEntry({ currentStage: 'Ideas' });
    await approveEntryStage(projectRoot, { uuid });
    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const transition = events.find((e) => e.kind === 'stage-transition');
    expect(transition).toBeDefined();
    if (transition && transition.kind === 'stage-transition') {
      expect(transition.from).toBe('Ideas');
      expect(transition.to).toBe('Planned');
    }
  });

  it('refuses to approve from Final (use publish, not approve)', async () => {
    await setupEntry({ currentStage: 'Final' });
    await expect(approveEntryStage(projectRoot, { uuid })).rejects.toThrow(/publish/i);
  });

  it('refuses to approve from Published / Blocked / Cancelled', async () => {
    for (const stage of ['Published', 'Blocked', 'Cancelled'] as const) {
      const u = `550e8400-e29b-41d4-a716-44665544000${stage.length % 9}`;
      const e: Entry = {
        uuid: u,
        slug: 'x-' + stage,
        title: 'X',
        keywords: [],
        source: 'manual',
        currentStage: stage,
        iterationByStage: {},
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
        ...(stage === 'Blocked' || stage === 'Cancelled'
          ? { priorStage: 'Drafting' as const }
          : {}),
      };
      await writeSidecar(projectRoot, e);
      await expect(approveEntryStage(projectRoot, { uuid: u })).rejects.toThrow(/cannot/i);
    }
  });

  // #148: every entry transition must regenerate calendar.md so the
  // canonical visible representation of the pipeline doesn't lag the
  // sidecar SSOT.
  it('regenerates calendar.md after the transition (#148)', async () => {
    await setupEntry({ currentStage: 'Ideas', slug: 'my-idea', title: 'My Idea' });
    // Pre-write calendar.md showing the entry under the OLD stage.
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      '# Editorial Calendar\n\n## Ideas\n\n*pre-existing stale content*\n',
    );

    await approveEntryStage(projectRoot, { uuid });

    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    // The entry should now appear under ## Planned, not ## Ideas, and
    // the stale "pre-existing stale content" placeholder should be gone.
    expect(md).not.toMatch(/pre-existing stale content/);
    // After regeneration, the entry's UUID should be inside the Planned section.
    const plannedSection = md.match(/## Planned[\s\S]*?(?=^## )/m)?.[0] ?? '';
    expect(plannedSection).toContain(uuid);
    const ideasSection = md.match(/## Ideas[\s\S]*?(?=^## )/m)?.[0] ?? '';
    expect(ideasSection).not.toContain(uuid);
  });
});
