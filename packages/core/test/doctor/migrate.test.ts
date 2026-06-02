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

  // #149: legacy CLI verbs that haven't been split (publish at the time
  // of writing) emit calendar.md via the legacy renderer, which puts
  // back `## Paused` and `## Review` sections. Detection MUST NOT take
  // that drift as a signal to re-run migration on already-migrated
  // sidecars — that overwrites correct sidecar fields with stale
  // heuristic data. Sidecar tree presence is the only authoritative
  // migration marker.
  it('returns false when entries dir exists even if calendar.md has legacy section names (#149)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
      await writeFile(
        join(projectRoot, '.deskwork', 'entries', '550e8400-e29b-41d4-a716-446655440000.json'),
        JSON.stringify({ uuid: '550e8400-e29b-41d4-a716-446655440000', currentStage: 'Ideas' }),
      );
      await writeFile(
        join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n\n## Paused\n\n*No entries.*\n\n## Review\n\n*No entries.*\n',
      );
      expect(await detectLegacySchema(projectRoot)).toBe(false);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('returns false when entries dir exists but is empty (already-migrated zero state)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
      await writeFile(
        join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Paused\n\n*No entries.*\n',
      );
      expect(await detectLegacySchema(projectRoot)).toBe(false);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('returns false when neither entries dir nor calendar.md exist (not a deskwork project)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
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

  it('reads legacy pipeline workflow records into iterationByStage (#141; reviewState retired per Commandment III)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'pipeline'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Drafting
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 33333333-3333-3333-3333-333333333333 | applied-doc | Applied Doc |  | kw | manual |
`);
      await writeFile(
        join(projectRoot, '.deskwork', 'review-journal', 'pipeline', '2026-01-01T00-00-00-000Z-aaa.json'),
        JSON.stringify({
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          site: 'main',
          slug: 'applied-doc',
          contentKind: 'longform',
          state: 'applied',
          currentVersion: 3,
          entryId: '33333333-3333-3333-3333-333333333333',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        }),
      );

      await migrateCalendar(projectRoot, { dryRun: false });

      const sidecarBody = await readFile(
        join(projectRoot, '.deskwork', 'entries', '33333333-3333-3333-3333-333333333333.json'),
        'utf8',
      );
      const sidecar: { iterationByStage: Record<string, number>; reviewState?: string } =
        JSON.parse(sidecarBody);
      expect(sidecar.iterationByStage.Drafting).toBe(3);
      // reviewState is RETIRED — the migration tool no longer derives
      // it from legacy pipeline records. Existing journals with
      // `review-state-change` events still parse for historical reads
      // but no field is populated on the sidecar.
      expect(sidecar.reviewState).toBeUndefined();
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('keeps the highest currentVersion across multiple pipeline records for one entry', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork', 'review-journal', 'pipeline'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Drafting
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 44444444-4444-4444-4444-444444444444 | multi | Multi |  | kw | manual |
`);
      await writeFile(
        join(projectRoot, '.deskwork', 'review-journal', 'pipeline', 'a.json'),
        JSON.stringify({
          id: 'a-id',
          state: 'applied',
          currentVersion: 1,
          entryId: '44444444-4444-4444-4444-444444444444',
        }),
      );
      await writeFile(
        join(projectRoot, '.deskwork', 'review-journal', 'pipeline', 'b.json'),
        JSON.stringify({
          id: 'b-id',
          state: 'iterating',
          currentVersion: 5,
          entryId: '44444444-4444-4444-4444-444444444444',
        }),
      );

      await migrateCalendar(projectRoot, { dryRun: false });
      const sidecar: { iterationByStage: Record<string, number> } = JSON.parse(await readFile(
        join(projectRoot, '.deskwork', 'entries', '44444444-4444-4444-4444-444444444444.json'),
        'utf8',
      ));
      expect(sidecar.iterationByStage.Drafting).toBe(5);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  /**
   * AUDIT-20260530-12 regression: pre-diff the loop returned e.from
   * unconditionally. After Phase 3 the loop was tightened to skip
   * non-editorial `from` values via `isEditorialStage`, but the
   * `StageTransitionEvent.from` schema accepts any non-empty string
   * (lane-template-driven). Silent skip meant a non-editorial `from`
   * (e.g. a visual-pipeline `Sketched`) produced a wrong prior-stage
   * fallback ('Drafting') without surfacing the unhandled value.
   *
   * The fix refuses non-editorial `from` values loudly — the
   * migration is editorial-only by design (it walks legacy
   * single-pipeline calendar.md), so a non-editorial `from` in the
   * journal is a data shape the migration explicitly should not
   * silently tolerate.
   */
  it('refuses migration when a stage-transition event carries a non-editorial from value (AUDIT-20260530-12)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      // Calendar.md places the entry in Cancelled (terminal off-pipeline)
      // so the migrator branches into inferPriorStageFromJournal.
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Cancelled
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 55555555-5555-5555-5555-555555555555 | cancelled-entry | Cancelled Entry |  | kw | manual |
`);

      // Seed a journal stage-transition whose `from` is non-editorial.
      // The schema's StageStringSchema accepts any non-empty string;
      // the migration's inferPriorStageFromJournal must REFUSE rather
      // than silently fall through to its default.
      const journalDir = join(projectRoot, '.deskwork', 'review-journal', 'history');
      await mkdir(journalDir, { recursive: true });
      await writeFile(
        join(journalDir, '2026-01-01T00-00-00-000Z-evt.json'),
        JSON.stringify({
          kind: 'stage-transition',
          at: '2026-01-01T00:00:00.000Z',
          entryId: '55555555-5555-5555-5555-555555555555',
          from: 'Sketched',
          to: 'Iterating',
        }),
      );

      let captured: unknown;
      try {
        await migrateCalendar(projectRoot, { dryRun: false });
      } catch (err) {
        captured = err;
      }
      expect(captured).toBeInstanceOf(Error);
      // The thrown error MUST name the offending non-editorial value
      // so the operator can find it.
      expect((captured as Error).message).toMatch(/Sketched|non-editorial|editorial-only/);
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
