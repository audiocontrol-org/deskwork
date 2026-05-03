import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJournalEvent, readJournalEvents } from '@/journal/index';
import type { JournalEvent } from '@/schema/journal-events';

describe('journal append + read', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('appends and reads back an iteration event', async () => {
    const event: JournalEvent = {
      kind: 'iteration',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting',
      version: 1,
      markdown: '# x',
    };
    await appendJournalEvent(projectRoot, event);
    const events = await readJournalEvents(projectRoot, { entryId: event.entryId });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it('filters by entryId', async () => {
    const e1: JournalEvent = {
      kind: 'iteration', at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting', version: 1, markdown: 'x',
    };
    const e2: JournalEvent = {
      kind: 'iteration', at: '2026-04-30T10:00:01.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440099',
      stage: 'Drafting', version: 1, markdown: 'y',
    };
    await appendJournalEvent(projectRoot, e1);
    await appendJournalEvent(projectRoot, e2);
    const events = await readJournalEvents(projectRoot, { entryId: e1.entryId });
    expect(events).toHaveLength(1);
    expect(events[0].entryId).toBe(e1.entryId);
  });

  it('returns events in chronological order', async () => {
    const ts = (n: number) => `2026-04-30T10:00:0${n}.000Z`;
    const events: JournalEvent[] = [
      { kind: 'iteration', at: ts(2), entryId: '550e8400-e29b-41d4-a716-446655440000', stage: 'Drafting', version: 2, markdown: 'v2' },
      { kind: 'iteration', at: ts(1), entryId: '550e8400-e29b-41d4-a716-446655440000', stage: 'Drafting', version: 1, markdown: 'v1' },
      { kind: 'iteration', at: ts(3), entryId: '550e8400-e29b-41d4-a716-446655440000', stage: 'Drafting', version: 3, markdown: 'v3' },
    ];
    for (const e of events) await appendJournalEvent(projectRoot, e);
    const read = await readJournalEvents(projectRoot, { entryId: events[0].entryId });
    expect(read.map(e => 'version' in e ? e.version : null)).toEqual([1, 2, 3]);
  });
});
