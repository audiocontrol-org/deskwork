import { describe, it, expect } from 'vitest';
import { extractEntriesForMigration } from '@/calendar/parse';

describe('extractEntriesForMigration', () => {
  it('extracts entries by stage from a calendar.md string', () => {
    const md = `# Editorial Calendar

## Ideas

| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | my-idea | My Idea |  | kw1 | manual |

## Drafting

| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440001 | my-draft | My Draft | desc | kw2, kw3 | manual |

## Paused

*No entries.*
`;
    const entries = extractEntriesForMigration(md);
    expect(entries).toHaveLength(2);
    expect(entries[0].currentStage).toBe('Ideas');
    expect(entries[0].slug).toBe('my-idea');
    expect(entries[1].currentStage).toBe('Drafting');
    expect(entries[1].keywords).toEqual(['kw2', 'kw3']);
  });

  it('maps Paused stage to Blocked during migration', () => {
    const md = `# Editorial Calendar

## Paused

| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440002 | paused-thing | Paused Thing |  |  | manual |
`;
    const entries = extractEntriesForMigration(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].currentStage).toBe('Blocked');
  });

  it('skips the Distribution section (not a stage)', () => {
    const md = `# Editorial Calendar

## Distribution

| Slug | Platform | URL |
|------|------|------|
| x | linkedin | https://... |
`;
    const entries = extractEntriesForMigration(md);
    expect(entries).toHaveLength(0);
  });
});
