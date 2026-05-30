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
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cancelEntry } from '@/entry/cancel';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import * as regenerateModule from '@/calendar/regenerate';
import { JournalEventSchema, type JournalEvent } from '@/schema/journal-events';

/**
 * Read every journal event written under the project's history dir
 * and return only `stage-transition` kinds. Re-parses through the
 * schema so the assertions exercise the new `metadata.cascadeFrom`
 * field's contract end-to-end (write -> read -> parse -> assert).
 */
async function readStageTransitionEvents(
  projectRoot: string,
): Promise<JournalEvent[]> {
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'history');
  const names = await readdir(dir);
  const events: JournalEvent[] = [];
  for (const name of names) {
    const raw = await readFile(join(dir, name), 'utf-8');
    const parsed = JournalEventSchema.parse(JSON.parse(raw));
    if (parsed.kind === 'stage-transition') {
      events.push(parsed);
    }
  }
  return events;
}

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

/**
 * Step 7.2.8 (#359): `metadata.cascadeFrom` linkage on cascaded
 * `stage-transition` events. The cascade walker attaches the
 * originating (top-level) group's UUID to every cascaded member's
 * event; the originator's own event omits the field; non-cascade
 * cancels do not populate it. Recursive (transitive) cascades record
 * the TOP-LEVEL originator's UUID, NOT the nearest parent — single-
 * hop audit traceability is the contract.
 */
describe('cancelEntry — metadata.cascadeFrom contract (#359 / Step 7.2.8)', () => {
  let projectRoot: string;
  const memberD = '550e8400-e29b-41d4-a716-446655440b01';
  const memberE = '550e8400-e29b-41d4-a716-446655440b02';
  const nestedGroup = '550e8400-e29b-41d4-a716-446655440b03';
  const nestedMember = '550e8400-e29b-41d4-a716-446655440b04';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-cancel-cascadefrom-'));
    await seedProjectScaffold(projectRoot);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('non-cascade cancel does NOT populate metadata.cascadeFrom', async () => {
    await seedEntry(projectRoot, soloUuid, 'solo', { currentStage: 'Drafting' });

    await cancelEntry(projectRoot, { uuid: soloUuid });

    const events = await readStageTransitionEvents(projectRoot);
    expect(events).toHaveLength(1);
    const evt = events[0];
    if (evt.kind !== 'stage-transition') throw new Error('unexpected kind');
    expect(evt.entryId).toBe(soloUuid);
    expect(evt.metadata?.cascadeFrom).toBeUndefined();
  });

  it('--cascade on a non-group entry does NOT populate metadata.cascadeFrom (no recursion fires)', async () => {
    await seedEntry(projectRoot, soloUuid, 'solo-cascaded', {
      currentStage: 'Drafting',
    });

    await cancelEntry(projectRoot, { uuid: soloUuid, cascade: true });

    const events = await readStageTransitionEvents(projectRoot);
    expect(events).toHaveLength(1);
    const evt = events[0];
    if (evt.kind !== 'stage-transition') throw new Error('unexpected kind');
    expect(evt.entryId).toBe(soloUuid);
    expect(evt.metadata?.cascadeFrom).toBeUndefined();
  });

  it('--cascade on a group: members carry metadata.cascadeFrom = group UUID; group itself does NOT', async () => {
    await seedEntry(projectRoot, memberD, 'm-d', { currentStage: 'Drafting' });
    await seedEntry(projectRoot, memberE, 'm-e', { currentStage: 'Outlining' });
    await seedEntry(projectRoot, groupUuid, 'cascadefrom-group', {
      currentStage: 'Drafting',
      members: [memberD, memberE],
    });

    await cancelEntry(projectRoot, { uuid: groupUuid, cascade: true });

    const events = await readStageTransitionEvents(projectRoot);
    expect(events).toHaveLength(3);

    const byEntry = new Map<string, JournalEvent>();
    for (const evt of events) {
      if (evt.kind === 'stage-transition') byEntry.set(evt.entryId, evt);
    }

    const groupEvt = byEntry.get(groupUuid);
    const memberDEvt = byEntry.get(memberD);
    const memberEEvt = byEntry.get(memberE);
    if (
      groupEvt?.kind !== 'stage-transition'
      || memberDEvt?.kind !== 'stage-transition'
      || memberEEvt?.kind !== 'stage-transition'
    ) {
      throw new Error('expected three stage-transition events');
    }

    // Originator: cascadeFrom MUST be absent (the group IS the source).
    expect(groupEvt.metadata?.cascadeFrom).toBeUndefined();

    // Cascaded members: cascadeFrom MUST equal the originating group's UUID.
    expect(memberDEvt.metadata?.cascadeFrom).toBe(groupUuid);
    expect(memberEEvt.metadata?.cascadeFrom).toBe(groupUuid);
  });

  it('--cascade on a recursive (nested) group: transitively-cascaded events carry the TOP-LEVEL originator UUID, not the nearest parent', async () => {
    // Build: groupUuid -> nestedGroup -> nestedMember.
    // Doctor's group-recursive rule normally refuses this shape, but
    // the cancel walker still has to behave correctly when one exists
    // — per the docblock at cancel.ts:198. Per Step 7.2.8 the
    // top-level originator semantic means nestedMember's event MUST
    // reference groupUuid, NOT nestedGroup.
    await seedEntry(projectRoot, nestedMember, 'nested-member', {
      currentStage: 'Drafting',
    });
    await seedEntry(projectRoot, nestedGroup, 'nested-group', {
      currentStage: 'Drafting',
      members: [nestedMember],
    });
    await seedEntry(projectRoot, groupUuid, 'top-level-group', {
      currentStage: 'Drafting',
      members: [nestedGroup],
    });

    await cancelEntry(projectRoot, { uuid: groupUuid, cascade: true });

    const events = await readStageTransitionEvents(projectRoot);
    expect(events).toHaveLength(3);

    const byEntry = new Map<string, JournalEvent>();
    for (const evt of events) {
      if (evt.kind === 'stage-transition') byEntry.set(evt.entryId, evt);
    }

    const topEvt = byEntry.get(groupUuid);
    const nestedGroupEvt = byEntry.get(nestedGroup);
    const nestedMemberEvt = byEntry.get(nestedMember);
    if (
      topEvt?.kind !== 'stage-transition'
      || nestedGroupEvt?.kind !== 'stage-transition'
      || nestedMemberEvt?.kind !== 'stage-transition'
    ) {
      throw new Error('expected three stage-transition events');
    }

    // Top-level originator: cascadeFrom omitted.
    expect(topEvt.metadata?.cascadeFrom).toBeUndefined();

    // Nested group: cascaded by groupUuid, so cascadeFrom === groupUuid.
    expect(nestedGroupEvt.metadata?.cascadeFrom).toBe(groupUuid);

    // Nested member: transitively cascaded. The contract demands the
    // TOP-LEVEL originator UUID, NOT the nearest parent (nestedGroup).
    expect(nestedMemberEvt.metadata?.cascadeFrom).toBe(groupUuid);
    expect(nestedMemberEvt.metadata?.cascadeFrom).not.toBe(nestedGroup);
  });

  it('--cascade with a missing member sidecar: member recorded as skipped (existing contract)', async () => {
    // memberD does NOT exist on disk — its UUID is in the group's
    // members[] but no sidecar file was seeded. Per AUDIT-20260530-23's
    // narrow-the-catch fix, missing sidecar remains a skippable case
    // (matched up-front via existsSync, not via a broad catch).
    await seedEntry(projectRoot, memberE, 'm-e-draft', { currentStage: 'Drafting' });
    await seedEntry(projectRoot, groupUuid, 'missing-member-group', {
      currentStage: 'Drafting',
      members: [memberD, memberE],
    });

    const result = await cancelEntry(projectRoot, { uuid: groupUuid, cascade: true });

    expect(result.toStage).toBe('Cancelled');
    // memberE cascaded; memberD recorded as skipped (no sidecar).
    expect(result.cascadedMembers?.map((m) => m.slug)).toEqual(['m-e-draft']);
    expect(result.skippedMembers).toHaveLength(1);
    const skipped = result.skippedMembers?.[0];
    if (skipped === undefined) throw new Error('expected one skipped member');
    expect(skipped.entryId).toBe(memberD);
    expect(skipped.reason).toBe('sidecar not found');
  });

  it('--cascade on a group with skipped members: skipped entries emit NO stage-transition event (cascadeFrom not applicable)', async () => {
    // memberD already Cancelled (off-pipeline skip), memberE Drafting
    // (proper cascade target). The skipped member must not produce a
    // stage-transition event at all; the cascaded member's event
    // carries cascadeFrom.
    await seedEntry(projectRoot, memberD, 'm-d-already', {
      currentStage: 'Cancelled',
    });
    await seedEntry(projectRoot, memberE, 'm-e-draft', {
      currentStage: 'Drafting',
    });
    await seedEntry(projectRoot, groupUuid, 'mixed-skip-group', {
      currentStage: 'Drafting',
      members: [memberD, memberE],
    });

    await cancelEntry(projectRoot, { uuid: groupUuid, cascade: true });

    const events = await readStageTransitionEvents(projectRoot);
    // Two events: group + memberE. memberD was skipped (no event).
    expect(events).toHaveLength(2);

    const byEntry = new Map<string, JournalEvent>();
    for (const evt of events) {
      if (evt.kind === 'stage-transition') byEntry.set(evt.entryId, evt);
    }
    expect(byEntry.has(memberD)).toBe(false);

    const groupEvt = byEntry.get(groupUuid);
    const memberEEvt = byEntry.get(memberE);
    if (
      groupEvt?.kind !== 'stage-transition'
      || memberEEvt?.kind !== 'stage-transition'
    ) {
      throw new Error('expected group + memberE events');
    }
    expect(groupEvt.metadata?.cascadeFrom).toBeUndefined();
    expect(memberEEvt.metadata?.cascadeFrom).toBe(groupUuid);
  });
});

/**
 * AUDIT-20260530-23: cascade catch narrowing. Pre-fix the cascade loop
 * wrapped the entire per-member chain (readSidecar → resolveTemplate →
 * recursive walker call → writeSidecar → appendJournalEvent) in one
 * broad try/catch and converted EVERY thrown error into a skipped
 * member with `slug: '(unresolved)'` and `reason: 'read failed: ...'`.
 * That swallowed three distinct corruption modes — corrupt sidecar
 * JSON, schema-invalid sidecars, and write failures mid-cascade —
 * masking them as if the member had been gracefully skipped.
 *
 * Post-fix the only skippable case is the genuinely-absent sidecar
 * (existsSync check before any readSidecar call). Every other failure
 * propagates with the underlying error message intact.
 */
describe('cancelEntry — cascade catch narrowing (AUDIT-20260530-23)', () => {
  let projectRoot: string;
  const memberCorrupt = '550e8400-e29b-41d4-a716-446655440c01';
  const memberHealthy = '550e8400-e29b-41d4-a716-446655440c02';
  const memberWriteFails = '550e8400-e29b-41d4-a716-446655440c03';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-cancel-narrow-catch-'));
    await seedProjectScaffold(projectRoot);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('corrupt member sidecar (invalid JSON) propagates the parse error instead of swallowing as skipped', async () => {
    // Seed a healthy member alongside the corrupt one so the cascade
    // has two cancelable targets — pre-fix both would be reported as
    // "skipped", post-fix the cascade aborts on the corrupt one.
    await seedEntry(projectRoot, memberHealthy, 'm-healthy', {
      currentStage: 'Drafting',
    });
    // Hand-write a corrupt sidecar (invalid JSON; readSidecar throws
    // `sidecar JSON invalid at <path>`).
    const corruptPath = join(
      projectRoot,
      '.deskwork',
      'entries',
      `${memberCorrupt}.json`,
    );
    await writeFile(corruptPath, '{ this is not valid json', 'utf-8');
    await seedEntry(projectRoot, groupUuid, 'corrupt-member-group', {
      currentStage: 'Drafting',
      members: [memberCorrupt, memberHealthy],
    });

    await expect(
      cancelEntry(projectRoot, { uuid: groupUuid, cascade: true }),
    ).rejects.toThrow(/sidecar JSON invalid/);
  });

  it('schema-invalid member sidecar propagates the schema error instead of swallowing as skipped', async () => {
    // Sidecar file exists but the JSON, while parsable, fails schema
    // validation (missing required fields). readSidecar throws
    // `sidecar schema invalid at <path>: ...`. Pre-fix: silently
    // skipped; post-fix: propagates.
    await seedEntry(projectRoot, memberHealthy, 'm-healthy-schema', {
      currentStage: 'Drafting',
    });
    const schemaInvalidPath = join(
      projectRoot,
      '.deskwork',
      'entries',
      `${memberCorrupt}.json`,
    );
    await writeFile(
      schemaInvalidPath,
      JSON.stringify({ uuid: memberCorrupt, slug: 'partial' }),
      'utf-8',
    );
    await seedEntry(projectRoot, groupUuid, 'schema-invalid-group', {
      currentStage: 'Drafting',
      members: [memberCorrupt, memberHealthy],
    });

    await expect(
      cancelEntry(projectRoot, { uuid: groupUuid, cascade: true }),
    ).rejects.toThrow(/sidecar schema invalid/);
  });

  it('partial-cascade throw still regenerates calendar in the finally (AUDIT-20260530-22)', async () => {
    // Pair AUDIT-22 (try/finally on the wrapper) with AUDIT-23 (narrow
    // catch — corrupt sidecar propagates). Without the finally the
    // walker's mid-cascade throw would leave calendar.md stale
    // (healthy members transitioned to Cancelled but never reflected
    // in the calendar). With the finally the calendar reconciles to
    // whatever sidecar state actually landed; the throw still
    // propagates to the caller.
    const regenerateSpy = vi.spyOn(regenerateModule, 'regenerateCalendar');
    try {
      // memberHealthy processes first (transitions to Cancelled);
      // memberCorrupt throws on read (parse error per AUDIT-23).
      await seedEntry(projectRoot, memberHealthy, 'm-healthy-finally', {
        currentStage: 'Drafting',
      });
      const corruptPath = join(
        projectRoot,
        '.deskwork',
        'entries',
        `${memberCorrupt}.json`,
      );
      await writeFile(corruptPath, '{ this is not valid json', 'utf-8');
      await seedEntry(projectRoot, groupUuid, 'partial-cascade-group', {
        currentStage: 'Drafting',
        members: [memberHealthy, memberCorrupt],
      });

      await expect(
        cancelEntry(projectRoot, { uuid: groupUuid, cascade: true }),
      ).rejects.toThrow(/sidecar JSON invalid/);

      // The try/finally contract: regenerateCalendar fires exactly
      // once even on the mid-cascade throw. Pre-fix: zero calls (the
      // throw aborted the wrapper before the regenerate line).
      expect(regenerateSpy).toHaveBeenCalledTimes(1);

      // The healthy member that DID process before the throw is in
      // its Cancelled state on disk; the regenerated calendar must
      // reflect that — assert the on-disk sidecar AND that the
      // calendar.md file exists and contains the cancelled member's
      // slug under the cancelled section.
      const healthyAfter = await readSidecar(projectRoot, memberHealthy);
      expect(healthyAfter.currentStage).toBe('Cancelled');
      const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
      const calendarText = await readFile(calendarPath, 'utf-8');
      expect(calendarText).toContain('m-healthy-finally');
    } finally {
      regenerateSpy.mockRestore();
    }
  });

  it('write failure mid-cascade propagates the write error instead of swallowing as skipped', async () => {
    // Drive the write to fail for a specific member by replacing its
    // sidecar file with a directory of the same name AFTER seeding the
    // group. writeSidecar uses atomic rename (`writeFile <path>.tmp` →
    // `rename` over the target); the rename onto a directory fails with
    // EISDIR. Pre-fix that error was caught + recorded as "skipped";
    // post-fix it propagates.
    await seedEntry(projectRoot, memberHealthy, 'm-healthy-write', {
      currentStage: 'Drafting',
    });
    await seedEntry(projectRoot, memberWriteFails, 'm-write-fails', {
      currentStage: 'Drafting',
    });
    // Replace the seeded sidecar file with a directory of the same name.
    const failPath = join(
      projectRoot,
      '.deskwork',
      'entries',
      `${memberWriteFails}.json`,
    );
    await rm(failPath, { force: true });
    await mkdir(failPath);
    await seedEntry(projectRoot, groupUuid, 'write-fail-group', {
      currentStage: 'Drafting',
      members: [memberWriteFails, memberHealthy],
    });

    // The chain hits the directory-shaped sidecar at readSidecar time
    // (read of a directory fails with EISDIR). Pre-fix this would be
    // swallowed as a skipped member; post-fix the underlying error
    // propagates with a non-matching skip reason.
    await expect(
      cancelEntry(projectRoot, { uuid: groupUuid, cascade: true }),
    ).rejects.toThrow();
  });
});
