/**
 * Verb suite — non-editorial coverage (visual preset).
 *
 * Phase 4 Task 4.1.3: every verb must work against a lane-template
 * whose stages differ from the editorial vocabulary. The visual preset
 * uses `Sketched / Iterating / Approved / Shipped` for linearStages
 * with `Approved` locked and adds `Archived` to off-pipeline.
 *
 * Per-verb expectations:
 *
 *   - approveEntryStage: graduates linear stages; refuses
 *     pre-terminal (`Approved`) with "use publish, not approve"; refuses
 *     terminal (`Shipped`) and off-pipeline.
 *   - iterateEntry: refuses locked stage (`Approved`) AND terminal AND
 *     off-pipeline.
 *   - cancelEntry: writes `Cancelled` (template includes it).
 *   - blockEntry: writes `Blocked` (template includes it).
 *   - inductEntry: refuses non-linear targets like `Archived` and
 *     reports the visual linearStages in the error message.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approveEntryStage } from '@/entry/approve';
import { cancelEntry } from '@/entry/cancel';
import { blockEntry } from '@/entry/block';
import { inductEntry } from '@/entry/induct';
import { iterateEntry } from '@/iterate/iterate';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import type { Entry } from '@/schema/entry';

describe('verbs — visual preset', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440099';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-vis-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'mockups.json'),
      JSON.stringify({
        id: 'mockups',
        name: 'Mockups',
        pipelineTemplate: 'visual',
      }),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: { main: { contentDir: 'mockups', calendarPath: '.deskwork/calendar.md' } },
        defaultSite: 'main',
      }),
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setupEntry(overrides: Partial<Entry>): Promise<Entry> {
    const entry: Entry = {
      uuid,
      slug: 'icon-set',
      title: 'Icon Set',
      keywords: [],
      source: 'manual',
      currentStage: 'Sketched',
      iterationByStage: {},
      lane: 'mockups',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      ...overrides,
    };
    await writeSidecar(projectRoot, entry);
    return entry;
  }

  // ---- approve ------------------------------------------------------

  it('approve: graduates Sketched → Iterating', async () => {
    await setupEntry({ currentStage: 'Sketched' });
    const r = await approveEntryStage(projectRoot, { uuid });
    expect(r.fromStage).toBe('Sketched');
    expect(r.toStage).toBe('Iterating');
  });

  it('approve: graduates Iterating → Approved', async () => {
    await setupEntry({ currentStage: 'Iterating' });
    const r = await approveEntryStage(projectRoot, { uuid });
    expect(r.toStage).toBe('Approved');
  });

  it('approve: refuses to graduate Approved → Shipped (must use publish)', async () => {
    await setupEntry({ currentStage: 'Approved' });
    await expect(approveEntryStage(projectRoot, { uuid })).rejects.toThrow(/publish/i);
  });

  it('approve: refuses to graduate the terminal Shipped stage', async () => {
    await setupEntry({ currentStage: 'Shipped' });
    await expect(approveEntryStage(projectRoot, { uuid })).rejects.toThrow(/terminal stage/i);
  });

  it('approve: refuses off-pipeline stages', async () => {
    for (const stage of ['Blocked', 'Cancelled', 'Archived']) {
      const u = `550e8400-e29b-41d4-a716-44665544010${stage.length % 9}`;
      const entry: Entry = {
        uuid: u,
        slug: `vis-${stage}`,
        title: 'V',
        keywords: [],
        source: 'manual',
        currentStage: stage,
        iterationByStage: {},
        lane: 'mockups',
        priorStage: 'Sketched',
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      };
      await writeSidecar(projectRoot, entry);
      await expect(approveEntryStage(projectRoot, { uuid: u })).rejects.toThrow(/off-pipeline/i);
    }
  });

  // ---- iterate ------------------------------------------------------

  it('iterate: refuses on Approved (locked stage)', async () => {
    await setupEntry({ currentStage: 'Approved', artifactPath: 'mockups/icon-set/index.md' });
    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/locked stage/i);
  });

  it('iterate: refuses on Shipped (terminal)', async () => {
    await setupEntry({ currentStage: 'Shipped', artifactPath: 'mockups/icon-set/index.md' });
    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/terminal stage/i);
  });

  it('iterate: refuses on Archived (off-pipeline, visual-specific)', async () => {
    await setupEntry({ currentStage: 'Archived', priorStage: 'Sketched', artifactPath: 'mockups/icon-set/index.md' });
    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/off-pipeline/i);
  });

  it('iterate: succeeds on Sketched and bumps the per-stage counter', async () => {
    await setupEntry({ currentStage: 'Sketched', artifactPath: 'mockups/icon-set/index.md' });
    await mkdir(join(projectRoot, 'mockups', 'icon-set'), { recursive: true });
    await writeFile(join(projectRoot, 'mockups', 'icon-set', 'index.md'), '# body\n');
    const r = await iterateEntry(projectRoot, { uuid });
    expect(r.stage).toBe('Sketched');
    expect(r.version).toBe(1);
  });

  // ---- cancel -------------------------------------------------------

  it('cancel: writes Cancelled (visual template includes it)', async () => {
    await setupEntry({ currentStage: 'Sketched' });
    const r = await cancelEntry(projectRoot, { uuid, reason: 'scrapped' });
    expect(r.toStage).toBe('Cancelled');
    const after = await readSidecar(projectRoot, uuid);
    expect(after.currentStage).toBe('Cancelled');
    expect(after.priorStage).toBe('Sketched');
  });

  it('cancel: refuses terminal stage Shipped', async () => {
    await setupEntry({ currentStage: 'Shipped' });
    await expect(cancelEntry(projectRoot, { uuid })).rejects.toThrow(/terminal stage/i);
  });

  // ---- block --------------------------------------------------------

  it('block: writes Blocked', async () => {
    await setupEntry({ currentStage: 'Iterating', iterationByStage: { Sketched: 1, Iterating: 2 } });
    const r = await blockEntry(projectRoot, { uuid, reason: 'awaiting brief' });
    expect(r.toStage).toBe('Blocked');
    const after = await readSidecar(projectRoot, uuid);
    expect(after.currentStage).toBe('Blocked');
    expect(after.priorStage).toBe('Iterating');
  });

  // ---- induct -------------------------------------------------------

  it('induct: returns Blocked entry to Sketched', async () => {
    await setupEntry({ currentStage: 'Blocked', priorStage: 'Iterating' });
    const r = await inductEntry(projectRoot, { uuid, targetStage: 'Sketched' });
    expect(r.toStage).toBe('Sketched');
    const after = await readSidecar(projectRoot, uuid);
    expect(after.currentStage).toBe('Sketched');
    // Off-pipeline induct clears priorStage.
    expect(after.priorStage).toBeUndefined();
  });

  it('induct: refuses to induct to an off-pipeline target like Archived', async () => {
    await setupEntry({ currentStage: 'Sketched' });
    await expect(inductEntry(projectRoot, { uuid, targetStage: 'Archived' })).rejects.toThrow(/off-pipeline/i);
  });

  it('induct: refuses an unknown stage with the visual linearStages list', async () => {
    await setupEntry({ currentStage: 'Sketched' });
    await expect(inductEntry(projectRoot, { uuid, targetStage: 'Drafting' })).rejects.toThrow(/Sketched, Iterating, Approved, Shipped/);
  });
});
