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

function entryJson(uuid: string, slug: string, stage: string): string {
  return JSON.stringify({
    uuid,
    slug,
    title: `T-${slug}`,
    keywords: [],
    source: '',
    currentStage: stage,
    iterationByStage: {},
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('validateAll - file-presence', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('flags Drafting sidecar when docs/<slug>/index.md is missing', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const slug = 'no-artifact';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'file-presence');
    expect(fails.length).toBe(1);
    expect(fails[0].entryId).toBe(uuid);
  });

  it('passes when artifact is present', async () => {
    const uuid = '22222222-2222-2222-2222-222222222222';
    const slug = 'has-artifact';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'file-presence');
    expect(fails).toEqual([]);
  });

  it('does not flag a Blocked sidecar (no on-disk artifact required)', async () => {
    const uuid = '33333333-3333-3333-3333-333333333333';
    const slug = 'blocked';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Blocked'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Blocked'),
    );

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'file-presence');
    expect(fails).toEqual([]);
  });

  it('flags Ideas sidecar when docs/<slug>/scrapbook/idea.md is missing', async () => {
    const uuid = '44444444-4444-4444-4444-444444444444';
    const slug = 'idea-missing';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Ideas'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Ideas'),
    );

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'file-presence');
    expect(fails.length).toBe(1);
    expect(fails[0].entryId).toBe(uuid);
  });
});
