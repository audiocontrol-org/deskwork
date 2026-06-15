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

  it('parses a legacy lane-create event carrying contentDir (Phase 39 back-compat read)', () => {
    // Old on-disk `lane-create` events emitted a top-level `contentDir`
    // detail key. Phase 39 retires the lane field but KEEPS the event
    // detail optional so historical journals still parse cleanly.
    const event: JournalEvent = {
      kind: 'lane-create',
      at: '2026-05-28T10:00:00.000Z',
      laneId: 'mockups',
      details: {
        name: 'Mockups',
        pipelineTemplate: 'visual',
        contentDir: 'src/mockups',
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a NEW lane-create event emitting scaffoldDefaults + host (Phase 39)', () => {
    // New `lane-create` events emit the lane's add-time scaffoldDefaults
    // (and optional host) instead of the retired contentDir.
    const event: JournalEvent = {
      kind: 'lane-create',
      at: '2026-05-28T10:00:00.000Z',
      laneId: 'mockups',
      details: {
        name: 'Mockups',
        pipelineTemplate: 'visual',
        scaffoldDefaults: { markdown: 'src/mockups' },
        host: 'example.com',
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a lane-update event (Phase 6 Task 6.1)', () => {
    const event: JournalEvent = {
      kind: 'lane-update',
      at: '2026-05-28T10:00:00.000Z',
      laneId: 'mockups',
      details: {
        changedFields: ['name'],
        before: { name: 'Mockups' },
        after: { name: 'Visual Mockups' },
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a lane-archive event (Phase 6 Task 6.1)', () => {
    const event: JournalEvent = {
      kind: 'lane-archive',
      at: '2026-05-28T10:00:00.000Z',
      laneId: 'stale-lane',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a lane-restore event (Phase 6 Task 6.1)', () => {
    const event: JournalEvent = {
      kind: 'lane-restore',
      at: '2026-05-28T10:00:00.000Z',
      laneId: 'stale-lane',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a lane-purge event (Phase 6 Task 6.1)', () => {
    const event: JournalEvent = {
      kind: 'lane-purge',
      at: '2026-05-28T10:00:00.000Z',
      laneId: 'empty-lane',
      details: { purgedPath: '/proj/.deskwork/lanes/empty-lane.json' },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a lane-move event (Phase 6 Task 6.1)', () => {
    const event: JournalEvent = {
      kind: 'lane-move',
      at: '2026-05-28T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      details: {
        fromLane: 'default',
        toLane: 'mockups',
        fromStage: 'Drafting',
        toStage: 'Sketch',
        fromArtifactPath: 'old/path.md',
        toArtifactPath: 'new/path.md',
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a pipeline-create event (Phase 6 Task 6.2)', () => {
    const event: JournalEvent = {
      kind: 'pipeline-create',
      at: '2026-05-28T10:00:00.000Z',
      pipelineId: 'my-blog',
      details: {
        name: 'My Blog',
        linearStages: ['Idea', 'Drafting', 'Review', 'Live'],
        lockedStages: [],
        offPipelineStages: [],
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a pipeline-update rename-stage event (Phase 6 Task 6.2)', () => {
    const event: JournalEvent = {
      kind: 'pipeline-update',
      at: '2026-05-28T10:00:00.000Z',
      pipelineId: 'my-blog',
      details: {
        operation: 'rename-stage',
        from: 'Drafting',
        to: 'Writing',
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a pipeline-delete event with reassigned lanes (Phase 6 Task 6.2)', () => {
    const event: JournalEvent = {
      kind: 'pipeline-delete',
      at: '2026-05-28T10:00:00.000Z',
      pipelineId: 'old-blog',
      details: {
        purgedPath: '/proj/.deskwork/pipelines/old-blog.json',
        reassignedLanes: [
          { laneId: 'default', from: 'old-blog', to: 'editorial' },
        ],
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });
});
