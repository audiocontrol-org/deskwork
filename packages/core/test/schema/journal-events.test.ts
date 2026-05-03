import { describe, it, expect } from 'vitest';
import { JournalEventSchema, type JournalEvent } from '@/schema/journal-events';

describe('JournalEventSchema', () => {
  it('parses an entry-created event', () => {
    const event: JournalEvent = {
      kind: 'entry-created',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      entry: {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'x',
        title: 'X',
        keywords: [],
        source: 'manual',
        currentStage: 'Ideas',
        iterationByStage: {},
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses an iteration event', () => {
    const event: JournalEvent = {
      kind: 'iteration',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting',
      version: 7,
      markdown: '# my draft\n\ncontents...',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a stage-transition event', () => {
    const event: JournalEvent = {
      kind: 'stage-transition',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      from: 'Drafting',
      to: 'Final',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects an event with unknown kind', () => {
    const event = {
      kind: 'something-else',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(false);
  });

  it('parses a review-state-change event', () => {
    const event: JournalEvent = {
      kind: 'review-state-change',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting',
      from: null,
      to: 'in-review',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });
});
