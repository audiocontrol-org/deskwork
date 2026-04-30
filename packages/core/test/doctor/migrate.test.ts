import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateCalendar, detectLegacySchema } from '@/doctor/migrate';

describe('detectLegacySchema', () => {
  it('returns true when calendar.md has a Paused section', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Paused\n\n*No entries.*\n');
      expect(await detectLegacySchema(projectRoot)).toBe(true);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('returns true when no .deskwork/entries directory exists', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n');
      expect(await detectLegacySchema(projectRoot)).toBe(true);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('returns false when sidecars exist', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n');
      expect(await detectLegacySchema(projectRoot)).toBe(false);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });
});

describe('migrateCalendar', () => {
  it('generates sidecars for each calendar entry', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | idea-one | Idea One |  | kw | manual |

## Drafting
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440001 | draft-one | Draft One | desc | kw2 | manual |
`);
      const result = await migrateCalendar(projectRoot, { dryRun: false });
      expect(result.entriesMigrated).toBe(2);

      const sidecars = await readdir(join(projectRoot, '.deskwork', 'entries'));
      expect(sidecars).toHaveLength(2);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('regenerates calendar.md with eight stage sections', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | idea-one | Idea One |  | kw | manual |

## Paused
*No entries.*

## Review
*No entries.*
`);
      await migrateCalendar(projectRoot, { dryRun: false });
      const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
      expect(md).toContain('## Final');
      expect(md).toContain('## Blocked');
      expect(md).toContain('## Cancelled');
      expect(md).not.toContain('## Review');
      expect(md).not.toContain('## Paused');
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('does not write when dryRun is true', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | idea-one | Idea One |  | kw | manual |
`);
      const result = await migrateCalendar(projectRoot, { dryRun: true });
      expect(result.entriesMigrated).toBe(1);

      const sidecars = await readdir(join(projectRoot, '.deskwork', 'entries')).catch(() => []);
      expect(sidecars).toHaveLength(0);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });
});
