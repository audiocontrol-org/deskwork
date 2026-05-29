/**
 * `cancelEntry` cascade — regenerate-count assertion (Step 7.2.7,
 * graphical-entries, GitHub #360 / AUDIT-20260529-18).
 *
 * Pre-fix behaviour: `cancelEntry` called `regenerateCalendar` once
 * per invocation; the cascade path recursively invoked `cancelEntry`
 * for every member, producing N+1 regenerate calls on a group with
 * N cascaded members.
 *
 * Post-fix behaviour: the walker (`cancelEntryWithoutCalendarRegen`)
 * does the per-entry transition; the public `cancelEntry` wrapper
 * calls `regenerateCalendar` exactly once at the cascade boundary,
 * for both single-entry and cascade invocations.
 *
 * The seam: `vi.spyOn(regenerateModule, 'regenerateCalendar')` wraps
 * the live export with a counter without replacing the implementation,
 * so calendar.md still gets written and downstream code that observes
 * calendar.md continues to function. We import the module as a
 * namespace (`import * as regenerateModule from ...`) so the spy
 * attaches to the same binding cancel.ts consumes — a destructured
 * import would bypass the spy.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cancelEntry } from '@/entry/cancel';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import * as regenerateModule from '@/calendar/regenerate';

const groupUuid = '550e8400-e29b-41d4-a716-446655440a01';
const memberA = '550e8400-e29b-41d4-a716-446655440a02';
const memberB = '550e8400-e29b-41d4-a716-446655440a03';
const memberC = '550e8400-e29b-41d4-a716-446655440a04';
const soloUuid = '550e8400-e29b-41d4-a716-446655440a05';

async function seedProjectScaffold(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
  await writeFile(
    join(projectRoot, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  await writeFile(
    join(projectRoot, '.deskwork', 'lanes', 'default.json'),
    JSON.stringify({
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    }),
    'utf-8',
  );
}

interface SeedOpts {
  readonly currentStage?: string;
  readonly members?: readonly string[];
}

async function seedEntry(
  projectRoot: string,
  uuid: string,
  slug: string,
  opts: SeedOpts = {},
): Promise<void> {
  await writeSidecar(projectRoot, {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: opts.currentStage ?? 'Drafting',
    iterationByStage: {},
    lane: 'default',
    ...(opts.members !== undefined && { members: opts.members }),
    createdAt: '2026-05-29T10:00:00.000Z',
    updatedAt: '2026-05-29T10:00:00.000Z',
  });
}

describe('cancelEntry — regenerate-count contract (#360 / Step 7.2.7)', () => {
  let projectRoot: string;
  let regenerateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-cancel-regen-'));
    await seedProjectScaffold(projectRoot);
    regenerateSpy = vi.spyOn(regenerateModule, 'regenerateCalendar');
  });

  afterEach(async () => {
    regenerateSpy.mockRestore();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('single-entry cancel calls regenerateCalendar exactly once', async () => {
    await seedEntry(projectRoot, soloUuid, 'solo', { currentStage: 'Drafting' });

    const result = await cancelEntry(projectRoot, { uuid: soloUuid });

    expect(result.toStage).toBe('Cancelled');
    expect(regenerateSpy).toHaveBeenCalledTimes(1);
  });

  it('cascade cancel on a 3-member group calls regenerateCalendar exactly once', async () => {
    await seedEntry(projectRoot, memberA, 'm-a', { currentStage: 'Drafting' });
    await seedEntry(projectRoot, memberB, 'm-b', { currentStage: 'Outlining' });
    await seedEntry(projectRoot, memberC, 'm-c', { currentStage: 'Planned' });
    await seedEntry(projectRoot, groupUuid, 'cascade-group', {
      currentStage: 'Drafting',
      members: [memberA, memberB, memberC],
    });

    const result = await cancelEntry(projectRoot, {
      uuid: groupUuid,
      cascade: true,
    });

    // All four entries transitioned to Cancelled
    expect(result.toStage).toBe('Cancelled');
    expect((await readSidecar(projectRoot, groupUuid)).currentStage).toBe('Cancelled');
    expect((await readSidecar(projectRoot, memberA)).currentStage).toBe('Cancelled');
    expect((await readSidecar(projectRoot, memberB)).currentStage).toBe('Cancelled');
    expect((await readSidecar(projectRoot, memberC)).currentStage).toBe('Cancelled');

    // The contract under test: ONE regenerate call for the whole cascade.
    // Pre-fix: 4 calls (1 per cancel invocation, recursive).
    expect(regenerateSpy).toHaveBeenCalledTimes(1);

    // CancelResult shape preserved
    expect(result.cascadedMembers?.map((m) => m.slug).sort()).toEqual([
      'm-a',
      'm-b',
      'm-c',
    ]);
    expect(result.skippedMembers).toEqual([]);
  });

  it('cascade cancel with mixed skips still calls regenerateCalendar exactly once', async () => {
    // memberA already Cancelled (off-pipeline skip),
    // memberB Published (terminal skip),
    // memberC Drafting (proper cascade target).
    await seedEntry(projectRoot, memberA, 'm-a-already', { currentStage: 'Cancelled' });
    await seedEntry(projectRoot, memberB, 'm-b-pub', { currentStage: 'Published' });
    await seedEntry(projectRoot, memberC, 'm-c-draft', { currentStage: 'Drafting' });
    await seedEntry(projectRoot, groupUuid, 'mixed-group', {
      currentStage: 'Drafting',
      members: [memberA, memberB, memberC],
    });

    const result = await cancelEntry(projectRoot, {
      uuid: groupUuid,
      cascade: true,
    });

    expect(result.toStage).toBe('Cancelled');
    expect(result.cascadedMembers?.map((m) => m.slug)).toEqual(['m-c-draft']);
    expect(result.skippedMembers).toHaveLength(2);

    // The skips never recursed into cancelEntry, so pre-fix this was
    // 2 calls (one for the head, one for memberC's recursive call).
    // Post-fix: still 1 call.
    expect(regenerateSpy).toHaveBeenCalledTimes(1);
  });

  it('cascade cancel on a non-group entry calls regenerateCalendar exactly once', async () => {
    await seedEntry(projectRoot, soloUuid, 'plain-with-cascade-flag', {
      currentStage: 'Drafting',
    });

    const result = await cancelEntry(projectRoot, {
      uuid: soloUuid,
      cascade: true,
    });

    expect(result.toStage).toBe('Cancelled');
    expect(result.cascadedMembers).toEqual([]);
    expect(result.skippedMembers).toEqual([]);
    expect(regenerateSpy).toHaveBeenCalledTimes(1);
  });
});
