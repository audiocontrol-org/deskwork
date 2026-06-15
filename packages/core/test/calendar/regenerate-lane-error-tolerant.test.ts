/**
 * `regenerateCalendar` error-tolerance regression (AUDIT-20260530-17).
 *
 * Pre-fix behaviour:
 *   `regenerateCalendar` → `renderCalendar` → `loadLaneContexts` →
 *   `loadLaneConfig` propagated any throw (malformed lane JSON, missing
 *   pipeline template, etc.) all the way out to the caller. Every entry
 *   verb (approve / block / cancel / induct / publish / iterate) calls
 *   `regenerateCalendar` as its FINAL step, AFTER `writeSidecar` +
 *   `appendJournalEvent` have already landed. A single malformed
 *   `.deskwork/lanes/*.json` therefore:
 *     - broke EVERY verb for EVERY entry,
 *     - threw to the caller AFTER on-disk state had partially advanced
 *       (sidecar + journal landed; calendar did not),
 *     - blast radius was the whole project, on any verb.
 *
 * Post-fix behaviour:
 *   `regenerateCalendar` wraps the render + write in try/catch. On
 *   throw, it logs via `console.warn` and returns without writing
 *   `calendar.md`. The verb completes; the sidecar + journal are
 *   durable; calendar.md is stale by exactly one transition; the
 *   doctor reconciles. The verb caller sees success.
 *
 * Tests below:
 *   1. `regenerateCalendar` itself does NOT throw on a malformed lane
 *      config; warns; leaves calendar.md untouched if pre-existing.
 *   2. `regenerateCalendar` does NOT throw when a valid lane points at
 *      a missing pipeline template.
 *   3. End-to-end through `approveEntryStage`: the verb succeeds; the
 *      sidecar advances; the journal event lands; a warning was
 *      emitted; calendar.md was NOT overwritten.
 *
 * The happy-path regression (valid lane configs → calendar regenerates
 * successfully) is already covered by `regenerate-multilane.test.ts` —
 * not duplicated here.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  readdir,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { regenerateCalendar } from '@/calendar/regenerate';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { approveEntryStage } from '@/entry/approve';
import type { Entry } from '@/schema/entry';
import { JournalEventSchema, type JournalEvent } from '@/schema/journal-events';

describe('regenerateCalendar — error-tolerant on lane/template misconfig (AUDIT-20260530-17)', () => {
  let projectRoot: string;
  let warnSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-regen-err-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* swallow */
    });
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await rm(projectRoot, { recursive: true, force: true });
  });

  let uuidCounter = 0;
  function nextUuid(): string {
    uuidCounter++;
    const hex = uuidCounter.toString(16).padStart(12, '0');
    return `550e8400-e29b-41d4-a716-${hex}`;
  }
  function entry(slug: string, stage: string, opts: Partial<Entry> = {}): Entry {
    return {
      uuid: nextUuid(),
      slug,
      title: slug.replace(/-/g, ' '),
      keywords: [],
      source: 'manual',
      currentStage: stage,
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
      ...opts,
    };
  }

  /**
   * Seed a malformed lane JSON file in `.deskwork/lanes/`. The file is
   * syntactically broken JSON, so `loadLaneConfig` throws on
   * `JSON.parse`. Pre-fix, the throw propagated all the way out of
   * `regenerateCalendar`.
   */
  async function seedMalformedLane(): Promise<void> {
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'broken.json'),
      '{not-json',
    );
  }

  it('does NOT throw when a lane JSON is malformed; logs a warning; leaves calendar.md unwritten', async () => {
    await seedMalformedLane();
    await writeSidecar(projectRoot, entry('post-a', 'Ideas'));

    // The contract: regenerateCalendar swallows the lane-load throw
    // and returns normally. Pre-fix this rejected with the
    // `Lane config at .../broken.json is not valid JSON: ...` error.
    await expect(regenerateCalendar(projectRoot)).resolves.toBeUndefined();

    // The warning surfaces the failure to the operator (so the
    // staleness is not silent).
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(warnArg).toContain('regenerateCalendar');
    expect(warnArg).toContain('doctor --fix');
    // The underlying lane-loader error message bubbles into the warn
    // detail (so an operator running the verb sees WHICH lane file
    // failed, not just "calendar didn't write").
    expect(warnArg).toContain('broken.json');

    // calendar.md MUST NOT have been written. Pre-fix the function
    // threw BEFORE the write; post-fix the catch is positioned around
    // the render+write so the same outcome (no write) holds. The
    // doctor reconciles on the next run.
    expect(existsSync(join(projectRoot, '.deskwork', 'calendar.md'))).toBe(
      false,
    );
  });

  it('does NOT throw when a lane references a non-existent pipeline template', async () => {
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'bad-template.json'),
      JSON.stringify({
        id: 'bad-template',
        name: 'Bad Template',
        // Pipeline template id that does NOT exist in the plugin
        // defaults or under .deskwork/pipelines/. `loadPipelineTemplate`
        // throws on resolution; the `loadLaneConfig` cross-validation
        // bubbles the throw up.
        pipelineTemplate: 'does-not-exist',
      }),
    );
    await writeSidecar(projectRoot, entry('post-a', 'Ideas'));

    await expect(regenerateCalendar(projectRoot)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(warnArg).toContain('regenerateCalendar');
    // The detail mentions the resolution failure shape so the operator
    // can pinpoint the misconfigured lane.
    expect(warnArg).toContain('does-not-exist');
    expect(existsSync(join(projectRoot, '.deskwork', 'calendar.md'))).toBe(
      false,
    );
  });

  it('verb (approveEntryStage) succeeds end-to-end even when a sibling lane file is malformed', async () => {
    // Set up TWO lanes: one valid editorial lane, one malformed.
    // The entry being approved lives on the valid lane. Pre-fix, the
    // single malformed lane took down EVERY verb for EVERY entry —
    // even entries whose own lane was fine.
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'default.json'),
      JSON.stringify({
        id: 'default',
        name: 'Default',
        pipelineTemplate: 'editorial',
      }),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'lanes', 'broken.json'),
      '{not-json',
    );

    const e = entry('post-a', 'Ideas', { lane: 'default' });
    await writeSidecar(projectRoot, e);

    // Verb runs cleanly — no throw.
    const result = await approveEntryStage(projectRoot, { uuid: e.uuid });

    // (a) Verb result is shaped as expected.
    expect(result.entryId).toBe(e.uuid);
    expect(result.fromStage).toBe('Ideas');
    expect(result.toStage).toBe('Planned');

    // (b) Sidecar's currentStage advanced — durable on disk.
    const refreshed = await readSidecar(projectRoot, e.uuid);
    expect(refreshed.currentStage).toBe('Planned');

    // (c) Stage-transition journal event landed — durable on disk.
    const events = await readStageTransitionEvents(projectRoot);
    expect(events).toHaveLength(1);
    const first = events[0];
    expect(first).toBeDefined();
    if (first === undefined) throw new Error('expected one journal event');
    if (first.kind !== 'stage-transition') {
      throw new Error('expected stage-transition kind');
    }
    expect(first.entryId).toBe(e.uuid);
    expect(first.from).toBe('Ideas');
    expect(first.to).toBe('Planned');

    // (d) `regenerateCalendar` was attempted but the malformed lane
    //     prevented the write. The warning was emitted so the
    //     staleness is operator-visible.
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(warnArg).toContain('broken.json');

    // (e) calendar.md was NOT overwritten (the verb never wrote one
    //     pre-call either; the doctor reconciles).
    expect(existsSync(join(projectRoot, '.deskwork', 'calendar.md'))).toBe(
      false,
    );
  });
});

/**
 * Read every journal event written under the project's history dir
 * and return only `stage-transition` kinds. Mirrors the helper in
 * `cancel-cascade.test.ts`.
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
