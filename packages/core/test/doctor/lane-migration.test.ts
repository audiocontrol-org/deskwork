/**
 * Tests for Phase 4 doctor lane-migration helper.
 *
 * Verifies:
 *   - dry-run reports planned changes without writing.
 *   - first run creates `default` lane + back-fills sidecars.
 *   - second run is a no-op (idempotent).
 *   - back-fill derives `artifactKind` from extension when available.
 *   - lane-migration journal events are emitted per changed sidecar.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateLaneMembership } from '@/doctor/lane-migration';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { readJournalEvents } from '@/journal/read';
import type { Entry } from '@/schema/entry';

async function setupFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dw-lane-mig-'));
  await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
  // Minimal deskwork config so the bootstrap can derive a default lane.
  await writeFile(
    join(root, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
      defaultSite: 'main',
    }),
  );
  return root;
}

function entry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
  return {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: {},
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('migrateLaneMembership', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupFixture();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('dry-run reports planned changes without writing', async () => {
    // AUDIT-20260530-18: the migration uses detectArtifactKind which
    // probes the filesystem; materialize the markdown file so the
    // probe can classify it as 'markdown'.
    await mkdir(join(root, 'docs', 'doc-a'), { recursive: true });
    await writeFile(join(root, 'docs', 'doc-a', 'index.md'), '# doc-a');
    await writeSidecar(root, entry(
      '11111111-1111-4111-8111-111111111111',
      'doc-a',
      { artifactPath: 'docs/doc-a/index.md' },
    ));

    const result = await migrateLaneMembership(root, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.entriesExamined).toBe(1);
    expect(result.entriesLaneBackfilled).toBe(1);
    expect(result.entriesArtifactKindBackfilled).toBe(1);
    expect(result.defaultLaneCreated).toBe(true);

    // No actual lane file written.
    await expect(stat(result.defaultLanePath)).rejects.toThrow();
    // Sidecar still has no lane / artifactKind.
    const sidecar = await readSidecar(root, '11111111-1111-4111-8111-111111111111');
    expect(sidecar.lane).toBeUndefined();
    expect(sidecar.artifactKind).toBeUndefined();
  });

  it('apply run creates default lane, back-fills sidecars, and emits journal events', async () => {
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    // Materialize artifacts so the filesystem probe can classify.
    await mkdir(join(root, 'docs', 'doc-a'), { recursive: true });
    await mkdir(join(root, 'docs', 'doc-b'), { recursive: true });
    await writeFile(join(root, 'docs', 'doc-a', 'index.md'), '# doc-a');
    await writeFile(join(root, 'docs', 'doc-b', 'index.md'), '# doc-b');
    await writeSidecar(root, entry(u1, 'doc-a', { artifactPath: 'docs/doc-a/index.md' }));
    await writeSidecar(root, entry(u2, 'doc-b', { artifactPath: 'docs/doc-b/index.md' }));

    const result = await migrateLaneMembership(root);
    expect(result.dryRun).toBe(false);
    expect(result.entriesExamined).toBe(2);
    expect(result.entriesLaneBackfilled).toBe(2);
    expect(result.entriesArtifactKindBackfilled).toBe(2);
    expect(result.defaultLaneCreated).toBe(true);

    // default.json is on disk and parses cleanly.
    const laneRaw = await readFile(result.defaultLanePath, 'utf8');
    const lane = JSON.parse(laneRaw);
    expect(lane.id).toBe('default');
    expect(lane.pipelineTemplate).toBe('editorial');
    // Phase 39: the bootstrapped lane carries no contentDir — the legacy
    // site dir becomes the add-time scaffoldDefaults.markdown.
    expect(lane.scaffoldDefaults).toEqual({ markdown: 'docs' });

    // Sidecars carry lane + artifactKind.
    const after1 = await readSidecar(root, u1);
    expect(after1.lane).toBe('default');
    expect(after1.artifactKind).toBe('markdown');
    const after2 = await readSidecar(root, u2);
    expect(after2.lane).toBe('default');
    expect(after2.artifactKind).toBe('markdown');

    // A lane-migration journal event landed per sidecar (plus the one
    // emitted by bootstrapDefaultLaneIfMissing for the lane creation).
    const events = await readJournalEvents(root);
    const lmEvents = events.filter((e) => e.kind === 'lane-migration');
    // At least one event per back-fill + one for the lane bootstrap.
    expect(lmEvents.length).toBeGreaterThanOrEqual(3);
  });

  it('is idempotent — second run is a no-op', async () => {
    await mkdir(join(root, 'docs', 'doc-a'), { recursive: true });
    await writeFile(join(root, 'docs', 'doc-a', 'index.md'), '# doc-a');
    await writeSidecar(root, entry(
      '11111111-1111-4111-8111-111111111111',
      'doc-a',
      { artifactPath: 'docs/doc-a/index.md' },
    ));
    await migrateLaneMembership(root);
    const result2 = await migrateLaneMembership(root);
    expect(result2.entriesLaneBackfilled).toBe(0);
    expect(result2.entriesArtifactKindBackfilled).toBe(0);
    expect(result2.defaultLaneCreated).toBe(false);
  });

  // AUDIT-20260530-18: the migration must use the authoritative
  // `detectArtifactKind` filesystem probe, NOT a path-only heuristic.
  // The pre-fix code dispatched on `extname()` alone — any `.html`
  // became `single-file-html`. A multi-file HTML mockup whose
  // `artifactPath` points at a directory containing index.html is
  // `html-mockup`. The visual/mockups lane (headline graphical-
  // entries use case) is exactly where multi-file mockups live; the
  // wrong kind would persist forever because the migration is
  // idempotent (skips entries that already carry `artifactKind`).
  it('classifies multi-file HTML mockup as html-mockup (not single-file-html) via filesystem probe', async () => {
    const u = '11111111-1111-4111-8111-111111111111';
    // Materialize the directory + index.html so the filesystem probe
    // can classify it.
    await mkdir(join(root, 'docs', 'page-a'), { recursive: true });
    await writeFile(join(root, 'docs', 'page-a', 'index.html'), '<html></html>');
    // artifactPath points at the DIRECTORY (the multi-file-mockup
    // shape per detectArtifactKind's contract).
    await writeSidecar(root, entry(u, 'page-a', { artifactPath: 'docs/page-a' }));

    await migrateLaneMembership(root);
    const after = await readSidecar(root, u);
    // Pre-fix this would have been derived as undefined (no
    // extension) or single-file-html (path-only `.html` extension).
    // Post-fix the filesystem probe correctly identifies the
    // directory-with-index.html shape as html-mockup.
    expect(after.artifactKind).toBe('html-mockup');
  });

  it('classifies a loose .html file as single-file-html via filesystem probe', async () => {
    const u = '22222222-2222-4222-8222-222222222222';
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'standalone.html'), '<html></html>');
    await writeSidecar(root, entry(u, 'standalone', { artifactPath: 'docs/standalone.html' }));

    await migrateLaneMembership(root);
    const after = await readSidecar(root, u);
    expect(after.artifactKind).toBe('single-file-html');
  });

  it('reports entries with missing artifacts on skippedMissingArtifact', async () => {
    const u = '33333333-3333-4333-8333-333333333333';
    // No file on disk at the artifactPath — detectArtifactKind throws.
    await writeSidecar(root, entry(u, 'deleted', { artifactPath: 'deleted/post.md' }));

    const result = await migrateLaneMembership(root);
    expect(result.skippedMissingArtifact).toContain(u);
    expect(result.skippedMissingArtifact).toHaveLength(1);
    // The lane back-fill still landed; only the artifactKind portion
    // was skipped because the probe could not classify the missing
    // artifact.
    const after = await readSidecar(root, u);
    expect(after.lane).toBe('default');
    expect(after.artifactKind).toBeUndefined();
  });

  // Post-AUDIT-20260530-18 the migration calls detectArtifactKind,
  // which throws on missing files. So an entry whose artifactPath
  // does not exist on disk lands in `skippedMissingArtifact` and its
  // `artifactKind` stays unset. The lane back-fill is independent and
  // still lands.
  it('skips artifactKind back-fill when artifact does not exist on disk', async () => {
    const u = '11111111-1111-4111-8111-111111111111';
    await writeSidecar(root, entry(u, 'no-ext', { artifactPath: 'docs/no-ext/raw' }));
    const result = await migrateLaneMembership(root);
    expect(result.entriesLaneBackfilled).toBe(1);
    expect(result.entriesArtifactKindBackfilled).toBe(0);
    expect(result.skippedMissingArtifact).toContain(u);
    const after = await readSidecar(root, u);
    expect(after.lane).toBe('default');
    expect(after.artifactKind).toBeUndefined();
  });

  it('does not back-fill entries that already carry lane + artifactKind', async () => {
    const u = '11111111-1111-4111-8111-111111111111';
    await writeSidecar(root, entry(u, 'doc-a', {
      artifactPath: 'docs/doc-a/index.md',
      lane: 'default',
      artifactKind: 'markdown',
    }));
    const result = await migrateLaneMembership(root);
    expect(result.entriesExamined).toBe(1);
    expect(result.entriesLaneBackfilled).toBe(0);
    expect(result.entriesArtifactKindBackfilled).toBe(0);
  });

  // AUDIT-20260530-15: distinguish corrupt sidecars from absent ones
  // instead of silently skipping. Same root cause as AUDIT-20260529-39
  // in entry-review/data.ts. The migration counts every `.json`
  // examined (corrupt sidecars too) and surfaces the corrupt list on
  // the result so the operator can triage rather than have the doctor
  // pretend nothing was there.
  it('surfaces malformed-JSON sidecars in skippedCorrupt and still migrates siblings', async () => {
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    // Well-formed sibling — materialize the artifact so the
    // detectArtifactKind probe can classify it.
    await mkdir(join(root, 'docs', 'doc-a'), { recursive: true });
    await writeFile(join(root, 'docs', 'doc-a', 'index.md'), '# doc-a');
    await writeSidecar(root, entry(u1, 'doc-a', { artifactPath: 'docs/doc-a/index.md' }));
    // Malformed JSON sibling — direct write bypasses sidecar helpers.
    await writeFile(join(root, '.deskwork', 'entries', `${u2}.json`), 'not-json');

    const result = await migrateLaneMembership(root);

    // The well-formed sibling is still migrated (one bad apple doesn't
    // block the run).
    expect(result.entriesLaneBackfilled).toBe(1);
    expect(result.entriesArtifactKindBackfilled).toBe(1);
    // Both files were examined — the corrupt one is not silently
    // dropped from the count.
    expect(result.entriesExamined).toBe(2);
    // The corrupt sidecar is reported by filename so the operator
    // sees what needs fixing.
    expect(result.skippedCorrupt).toContain(`${u2}.json`);
    expect(result.skippedCorrupt).toHaveLength(1);

    // The well-formed sibling carries lane + kind.
    const after1 = await readSidecar(root, u1);
    expect(after1.lane).toBe('default');
    expect(after1.artifactKind).toBe('markdown');
  });

  it('surfaces schema-invalid sidecars in skippedCorrupt', async () => {
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    await mkdir(join(root, 'docs', 'doc-a'), { recursive: true });
    await writeFile(join(root, 'docs', 'doc-a', 'index.md'), '# doc-a');
    await writeSidecar(root, entry(u1, 'doc-a', { artifactPath: 'docs/doc-a/index.md' }));
    // JSON-parseable but missing required fields (e.g. no `uuid`).
    await writeFile(
      join(root, '.deskwork', 'entries', `${u2}.json`),
      JSON.stringify({ slug: 'orphan', title: 'orphan' }),
    );

    const result = await migrateLaneMembership(root);

    expect(result.entriesLaneBackfilled).toBe(1);
    expect(result.entriesExamined).toBe(2);
    expect(result.skippedCorrupt).toContain(`${u2}.json`);
    expect(result.skippedCorrupt).toHaveLength(1);
  });
});
