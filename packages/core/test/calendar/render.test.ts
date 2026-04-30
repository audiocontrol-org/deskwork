import { describe, it, expect } from 'vitest';
import { renderCalendar } from '@/calendar/render';
import type { Entry } from '@/schema/entry';

describe('renderCalendar', () => {
  it('renders an empty calendar with all eight stage sections', () => {
    const md = renderCalendar([]);
    expect(md).toContain('## Ideas');
    expect(md).toContain('## Planned');
    expect(md).toContain('## Outlining');
    expect(md).toContain('## Drafting');
    expect(md).toContain('## Final');
    expect(md).toContain('## Published');
    expect(md).toContain('## Blocked');
    expect(md).toContain('## Cancelled');
    expect(md).toContain('## Distribution');
  });

  it('renders entries grouped by currentStage', () => {
    const entries: Entry[] = [
      {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'idea-one',
        title: 'Idea One',
        description: 'first idea',
        keywords: ['kw1'],
        source: 'manual',
        currentStage: 'Ideas',
        iterationByStage: { Ideas: 1 },
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
      {
        uuid: '550e8400-e29b-41d4-a716-446655440001',
        slug: 'draft-one',
        title: 'Draft One',
        keywords: [],
        source: 'manual',
        currentStage: 'Drafting',
        iterationByStage: { Ideas: 1, Planned: 1, Outlining: 2, Drafting: 5 },
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T11:00:00.000Z',
      },
    ];
    const md = renderCalendar(entries);
    const ideaSection = md.split('## Ideas')[1].split('##')[0];
    const draftingSection = md.split('## Drafting')[1].split('##')[0];
    expect(ideaSection).toContain('idea-one');
    expect(ideaSection).not.toContain('draft-one');
    expect(draftingSection).toContain('draft-one');
    expect(draftingSection).not.toContain('idea-one');
  });

  it('renders empty stage sections with "No entries" placeholder', () => {
    const md = renderCalendar([]);
    expect(md).toContain('*No entries.*');
  });

  it('includes all required columns in the table header', () => {
    const md = renderCalendar([{
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x', title: 'X', keywords: [], source: 'manual',
      currentStage: 'Ideas', iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    }]);
    const ideasSection = md.split('## Ideas')[1].split('##')[0];
    expect(ideasSection).toContain('| UUID | Slug | Title | Description | Keywords | Source | Updated |');
  });
});
