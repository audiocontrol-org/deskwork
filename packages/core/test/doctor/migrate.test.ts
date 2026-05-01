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

  it('reads sourceFile from ingest journal and writes artifactPath on the sidecar (#140)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'ingest'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Drafting
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 11111111-1111-1111-1111-111111111111 | foo | Foo |  | kw | manual |
`);
      // Legacy ingest journal records the actual on-disk path.
      await writeFile(
        join(projectRoot, '.deskwork', 'review-journal', 'ingest', '2026-01-01T00-00-00-000Z-foo.json'),
        JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          timestamp: '2026-01-01T00:00:00.000Z',
          event: 'ingest',
          slug: 'foo',
          entryId: '11111111-1111-1111-1111-111111111111',
          site: 'main',
          stage: 'Drafting',
          sourceFile: 'docs/1.0/foo.md',
          frontmatterSnapshot: {},
          derivation: { slug: 'path', state: 'default', date: 'mtime' },
        }),
      );

      await migrateCalendar(projectRoot, { dryRun: false });

      const sidecarBody = await readFile(
        join(projectRoot, '.deskwork', 'entries', '11111111-1111-1111-1111-111111111111.json'),
        'utf8',
      );
      const sidecar: { artifactPath?: string } = JSON.parse(sidecarBody);
      expect(sidecar.artifactPath).toBe('docs/1.0/foo.md');
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('omits artifactPath when no ingest journal entry references the entry', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Drafting
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 22222222-2222-2222-2222-222222222222 | bar | Bar |  | kw | manual |
`);
      await migrateCalendar(projectRoot, { dryRun: false });
      const sidecarBody = await readFile(
        join(projectRoot, '.deskwork', 'entries', '22222222-2222-2222-2222-222222222222.json'),
        'utf8',
      );
      const sidecar: { artifactPath?: string } = JSON.parse(sidecarBody);
      expect(sidecar.artifactPath).toBeUndefined();
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
