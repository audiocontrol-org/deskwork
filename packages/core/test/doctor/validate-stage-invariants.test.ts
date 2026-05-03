import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';

const NOW = '2026-04-30T12:00:00.000Z';

const CAL_HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER =
  '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';

function calendarMd(uuid: string, slug: string, stage: string): string {
  return CAL_HEADER + `## ${stage}\n\n` + TABLE_HEADER +
    `| ${uuid} | ${slug} | T-${slug} |  |  |  | ${NOW} |\n\n`;
}

interface EntryOverrides {
  uuid: string;
  slug: string;
  stage: string;
  priorStage?: string;
  iterationByStage?: Record<string, number>;
}

function entryJson(o: EntryOverrides): string {
  const obj: Record<string, unknown> = {
    uuid: o.uuid,
    slug: o.slug,
    title: `T-${o.slug}`,
    keywords: [],
    source: '',
    currentStage: o.stage,
    iterationByStage: o.iterationByStage ?? {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  if (o.priorStage !== undefined) obj.priorStage = o.priorStage;
  return JSON.stringify(obj);
}

async function seedCalendar(projectRoot: string, uuid: string, slug: string, stage: string): Promise<void> {
  await writeFile(
    join(projectRoot, '.deskwork', 'calendar.md'),
    calendarMd(uuid, slug, stage),
  );
}

async function seedArtifact(projectRoot: string, slug: string, stage: string): Promise<void> {
  if (stage === 'Blocked' || stage === 'Cancelled') return;
  if (stage === 'Ideas') {
    await mkdir(join(projectRoot, 'docs', slug, 'scrapbook'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md'), '');
    return;
  }
  if (stage === 'Planned') {
    await mkdir(join(projectRoot, 'docs', slug, 'scrapbook'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', slug, 'scrapbook', 'plan.md'), '');
    return;
  }
  if (stage === 'Outlining') {
    await mkdir(join(projectRoot, 'docs', slug, 'scrapbook'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', slug, 'scrapbook', 'outline.md'), '');
    return;
  }
  await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
  await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');
}

describe('validateAll - stage-invariants', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('flags a Blocked entry that lacks priorStage', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const slug = 'blocked-no-prior';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson({ uuid, slug, stage: 'Blocked' }),
    );
    await seedCalendar(projectRoot, uuid, slug, 'Blocked');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'stage-invariants');
    expect(fails.some((f) => f.entryId === uuid && /priorStage/i.test(f.message))).toBe(true);
  });

  it('flags a Cancelled entry that lacks priorStage', async () => {
    const uuid = '22222222-2222-2222-2222-222222222222';
    const slug = 'cancelled-no-prior';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson({ uuid, slug, stage: 'Cancelled' }),
    );
    await seedCalendar(projectRoot, uuid, slug, 'Cancelled');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'stage-invariants');
    expect(fails.some((f) => f.entryId === uuid && /priorStage/i.test(f.message))).toBe(true);
  });

  it('flags a pipeline-stage (Drafting) entry that has priorStage set', async () => {
    const uuid = '33333333-3333-3333-3333-333333333333';
    const slug = 'pipeline-with-prior';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson({ uuid, slug, stage: 'Drafting', priorStage: 'Outlining' }),
    );
    await seedCalendar(projectRoot, uuid, slug, 'Drafting');
    await seedArtifact(projectRoot, slug, 'Drafting');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'stage-invariants');
    expect(fails.some((f) => f.entryId === uuid && /priorStage/i.test(f.message))).toBe(true);
  });

  it('flags a Published entry whose iterationByStage.Published > 1', async () => {
    const uuid = '44444444-4444-4444-4444-444444444444';
    const slug = 'pub-frozen';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson({ uuid, slug, stage: 'Published', iterationByStage: { Published: 2 } }),
    );
    await seedCalendar(projectRoot, uuid, slug, 'Published');
    await seedArtifact(projectRoot, slug, 'Published');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'stage-invariants');
    expect(fails.some((f) => f.entryId === uuid && /Published/i.test(f.message))).toBe(true);
  });

  it('passes a clean Blocked entry with priorStage set', async () => {
    const uuid = '55555555-5555-5555-5555-555555555555';
    const slug = 'blocked-clean';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson({ uuid, slug, stage: 'Blocked', priorStage: 'Drafting' }),
    );
    await seedCalendar(projectRoot, uuid, slug, 'Blocked');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'stage-invariants');
    expect(fails).toEqual([]);
  });

  it('passes a clean pipeline-stage entry without priorStage', async () => {
    const uuid = '66666666-6666-6666-6666-666666666666';
    const slug = 'drafting-clean';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson({ uuid, slug, stage: 'Drafting' }),
    );
    await seedCalendar(projectRoot, uuid, slug, 'Drafting');
    await seedArtifact(projectRoot, slug, 'Drafting');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'stage-invariants');
    expect(fails).toEqual([]);
  });
});
