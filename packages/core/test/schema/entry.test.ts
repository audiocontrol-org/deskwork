import { describe, it, expect } from 'vitest';
import type { Stage } from '@/schema/entry';
import { isLinearPipelineStage, isOffPipelineStage, nextStage, EntrySchema, type Entry } from '@/schema/entry';

describe('Stage enum', () => {
  it('contains all eight stages', () => {
    const stages: Stage[] = ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled'];
    expect(stages.length).toBe(8);
  });

  it('isLinearPipelineStage returns true for pipeline stages', () => {
    expect(isLinearPipelineStage('Ideas')).toBe(true);
    expect(isLinearPipelineStage('Drafting')).toBe(true);
    expect(isLinearPipelineStage('Published')).toBe(true);
  });

  it('isLinearPipelineStage returns false for off-pipeline stages', () => {
    expect(isLinearPipelineStage('Blocked')).toBe(false);
    expect(isLinearPipelineStage('Cancelled')).toBe(false);
  });

  it('isOffPipelineStage is the inverse', () => {
    expect(isOffPipelineStage('Blocked')).toBe(true);
    expect(isOffPipelineStage('Drafting')).toBe(false);
  });

  it('nextStage returns the linear successor', () => {
    expect(nextStage('Ideas')).toBe('Planned');
    expect(nextStage('Planned')).toBe('Outlining');
    expect(nextStage('Outlining')).toBe('Drafting');
    expect(nextStage('Drafting')).toBe('Final');
  });

  it('nextStage returns null for stages without a forward successor', () => {
    expect(nextStage('Final')).toBe(null);       // use publish, not approve
    expect(nextStage('Published')).toBe(null);
    expect(nextStage('Blocked')).toBe(null);
    expect(nextStage('Cancelled')).toBe(null);
  });
});

describe('EntrySchema', () => {
  it('parses a valid Ideas entry', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'my-article',
      title: 'My Article',
      keywords: ['kw1'],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('silently drops a vestigial reviewState field on read (Commandment III back-compat)', () => {
    // Per DESKWORK-STATE-MACHINE.md Commandment III, `reviewState` is
    // retired from the Entry type. Legacy sidecars still on disk may
    // carry a vestigial `reviewState` key; the schema's non-strict
    // mode drops it silently on read, and the parsed Entry has no
    // such field. The test uses a runtime-typed literal (rather than
    // the `Entry` type) because TypeScript's type-system correctly
    // forbids the extra key on the inferred type.
    const legacy: Record<string, unknown> = {
      uuid: '550e8400-e29b-41d4-a716-446655440001',
      slug: 'my-second-article',
      title: 'My Second',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Ideas: 3, Planned: 2, Outlining: 4, Drafting: 7 },
      reviewState: 'in-review', // vestigial — schema drops this
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T11:00:00.000Z',
    };
    const result = EntrySchema.safeParse(legacy);
    expect(result.success).toBe(true);
    if (result.success) {
      // The parsed object must NOT carry `reviewState` — Commandment III
      // requires the field be invisible to consumers post-parse.
      expect('reviewState' in result.data).toBe(false);
    }
  });

  it('accepts an entry whose stage is not in the legacy editorial enum (Phase 3 graphical-entries)', () => {
    // Per Phase 3 Task 3.2.2 the schema's `currentStage` accepts any
    // non-empty string; runtime validation against the lane's pipeline
    // template happens outside the schema. A stage value like
    // `'Reviewing'` (legitimate in a custom template) must parse.
    const customStage = {
      uuid: '550e8400-e29b-41d4-a716-446655440002',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Reviewing',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(customStage).success).toBe(true);
  });

  it('rejects an entry with an empty-string stage', () => {
    const invalid = {
      uuid: '550e8400-e29b-41d4-a716-446655440002',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: '',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an entry with malformed uuid', () => {
    const invalid = {
      uuid: 'not-a-uuid',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts artifactPath as optional', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440010',
      slug: 'my-article',
      title: 'My Article',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts artifactPath when provided', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440011',
      slug: 'my-article',
      title: 'My Article',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      artifactPath: 'docs/1.0/my-article.md',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifactPath).toBe('docs/1.0/my-article.md');
    }
  });

  it('rejects artifactPath if not a string', () => {
    const invalid = {
      uuid: '550e8400-e29b-41d4-a716-446655440012',
      slug: 'my-article',
      title: 'My Article',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      artifactPath: 42,
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('parses a Blocked entry with priorStage', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440003',
      slug: 'paused-thing',
      title: 'Paused Thing',
      keywords: [],
      source: 'manual',
      currentStage: 'Blocked',
      priorStage: 'Drafting',
      iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 5 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(valid).success).toBe(true);
  });

  // Phase 7 Task 7.1 — members[] schema delta. Per the workplan:
  //   - 7.1.1: extend EntrySidecar with `members?: string[]` (array of
  //     member entry UUIDs).
  //   - 7.1.2: invariant — entries with non-empty `members[]` are
  //     groups; absent or empty means a regular entry. No separate
  //     "group" entity; same schema, same code paths.
  //   - 7.1.3: group entries can optionally carry `artifactPath`
  //     (content body present) or omit it (metadata-only group). Both
  //     shapes must parse.

  it('accepts an entry without a members field (regular entry; backward-compat)', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440020',
      slug: 'regular',
      title: 'Regular Entry',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.members).toBeUndefined();
    }
  });

  it('accepts a group entry with non-empty members[] (Step 7.1.1)', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440021',
      slug: 'visual-redesign-group',
      title: 'Visual Redesign Group',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      members: [
        '550e8400-e29b-41d4-a716-446655440100',
        '550e8400-e29b-41d4-a716-446655440101',
      ],
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.members).toEqual([
        '550e8400-e29b-41d4-a716-446655440100',
        '550e8400-e29b-41d4-a716-446655440101',
      ]);
    }
  });

  it('accepts a group entry with empty members[] (semantically equivalent to no members)', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440022',
      slug: 'empty-group',
      title: 'Empty Group',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      members: [],
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.members).toEqual([]);
    }
  });

  it('accepts a group entry with artifactPath (Step 7.1.3 — group has content body)', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440023',
      slug: 'manifesto-group',
      title: 'Manifesto Group',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      members: ['550e8400-e29b-41d4-a716-446655440102'],
      artifactPath: 'docs/manifesto.md',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifactPath).toBe('docs/manifesto.md');
      expect(result.data.members).toEqual(['550e8400-e29b-41d4-a716-446655440102']);
    }
  });

  it('accepts a group entry without artifactPath (Step 7.1.3 — metadata-only group)', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440024',
      slug: 'metadata-only-group',
      title: 'Metadata-Only Group',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      members: ['550e8400-e29b-41d4-a716-446655440103'],
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.artifactPath).toBeUndefined();
      expect(result.data.members).toHaveLength(1);
    }
  });

  it('rejects members[] entries that are not UUIDs (first element invalid)', () => {
    const invalid = {
      uuid: '550e8400-e29b-41d4-a716-446655440025',
      slug: 'bad-member-id',
      title: 'Bad Member ID',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      members: ['not-a-uuid', '550e8400-e29b-41d4-a716-446655440104'],
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects members[] entries that are not UUIDs (last element invalid)', () => {
    // Sibling of the prior test; proves the validator walks every
    // element rather than short-circuiting on the first. Caught as a
    // coverage gap in the Track 3 code-quality review of e47ed3e —
    // see audit-log AUDIT-20260529-14.
    const invalid = {
      uuid: '550e8400-e29b-41d4-a716-446655440027',
      slug: 'bad-last-member-id',
      title: 'Bad Last Member ID',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      members: ['550e8400-e29b-41d4-a716-446655440106', 'not-a-uuid'],
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects members when it is not an array', () => {
    const invalid = {
      uuid: '550e8400-e29b-41d4-a716-446655440026',
      slug: 'members-wrong-type',
      title: 'Members Wrong Type',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      members: '550e8400-e29b-41d4-a716-446655440105',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });
});
