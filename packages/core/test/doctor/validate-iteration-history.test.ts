import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';
import { appendJournalEvent } from '@/journal/append';

const NOW = '2026-04-30T12:00:00.000Z';

const CAL_HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER =
  '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';

function calendarMd(uuid: string, slug: string, stage: string): string {
  return CAL_HEADER + `## ${stage}\n\n` + TABLE_HEADER +
    `| ${uuid} | ${slug} | T-${slug} |  |  |  | ${NOW} |\n\n`;
}

function entryJson(
  uuid: string,
  slug: string,
  stage: string,
  iterationByStage: Record<string, number>,
): string {
  return JSON.stringify({
    uuid,
    slug,
    title: `T-${slug}`,
    keywords: [],
    source: '',
    currentStage: stage,
    iterationByStage,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedArtifact(projectRoot: string, slug: string): Promise<void> {
  await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
  await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');
}

describe('validateAll - iteration-history', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('does NOT flag when sidecar.iterationByStage[s] > journal iteration count (migration tolerance #141)', async () => {
    // Sidecar carries iteration count from a legacy pipeline-workflow record
    // (#141) that never had per-event iteration journal entries. We treat
    // sidecar > journal as the migration case rather than drift.
    const uuid = '11111111-1111-1111-1111-111111111111';
    const slug = 'migrated-from-legacy';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting', { Drafting: 3 }),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await seedArtifact(projectRoot, slug);

    await appendJournalEvent(projectRoot, {
      kind: 'iteration',
      at: NOW,
      entryId: uuid,
      stage: 'Drafting',
      version: 1,
      markdown: '#',
    });

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'iteration-history');
    expect(fails).toEqual([]);
  });

  it('flags when journal iteration count > sidecar.iterationByStage[s] (real drift)', async () => {
    // The dangerous direction: events exist in the journal that the sidecar
    // doesn't track. Suggests sidecar lost data.
    const uuid = '11112222-1111-1111-1111-111111111111';
    const slug = 'lost-count';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting', { Drafting: 1 }),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await seedArtifact(projectRoot, slug);

    for (let v = 1; v <= 3; v++) {
      await appendJournalEvent(projectRoot, {
        kind: 'iteration',
        at: NOW,
        entryId: uuid,
        stage: 'Drafting',
        version: v,
        markdown: `# v${v}`,
      });
    }

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'iteration-history');
    expect(fails.length).toBeGreaterThanOrEqual(1);
    expect(fails.some((f) => f.entryId === uuid && /Drafting/.test(f.message))).toBe(true);
  });

  it('does not flag when iterationByStage is empty (migration tolerance)', async () => {
    const uuid = '22222222-2222-2222-2222-222222222222';
    const slug = 'migrated';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting', {}),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await seedArtifact(projectRoot, slug);

    await appendJournalEvent(projectRoot, {
      kind: 'iteration',
      at: NOW,
      entryId: uuid,
      stage: 'Drafting',
      version: 1,
      markdown: '#',
    });

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'iteration-history');
    expect(fails).toEqual([]);
  });

  it('passes when sidecar.iterationByStage matches journal counts', async () => {
    const uuid = '33333333-3333-3333-3333-333333333333';
    const slug = 'matched';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting', { Drafting: 2 }),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await seedArtifact(projectRoot, slug);

    await appendJournalEvent(projectRoot, {
      kind: 'iteration',
      at: '2026-04-29T10:00:00.000Z',
      entryId: uuid,
      stage: 'Drafting',
      version: 1,
      markdown: '#',
    });
    await appendJournalEvent(projectRoot, {
      kind: 'iteration',
      at: NOW,
      entryId: uuid,
      stage: 'Drafting',
      version: 2,
      markdown: '##',
    });

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'iteration-history');
    expect(fails).toEqual([]);
  });

  it('flags when journal has more iteration events than sidecar (and sidecar > 0)', async () => {
    const uuid = '44444444-4444-4444-4444-444444444444';
    const slug = 'extra-events';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting', { Drafting: 1 }),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await seedArtifact(projectRoot, slug);

    await appendJournalEvent(projectRoot, {
      kind: 'iteration',
      at: '2026-04-29T10:00:00.000Z',
      entryId: uuid,
      stage: 'Drafting',
      version: 1,
      markdown: '#',
    });
    await appendJournalEvent(projectRoot, {
      kind: 'iteration',
      at: NOW,
      entryId: uuid,
      stage: 'Drafting',
      version: 2,
      markdown: '##',
    });

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'iteration-history');
    expect(fails.some((f) => f.entryId === uuid && /Drafting/.test(f.message))).toBe(true);
  });
});
