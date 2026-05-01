import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';

const NOW = '2026-04-30T12:00:00.000Z';

const CAL_HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER =
  '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';

function calRow(uuid: string, slug: string): string {
  return `| ${uuid} | ${slug} | T-${slug} |  |  |  | ${NOW} |\n`;
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

describe('validateAll - cross-entry', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('flags two sidecars that share the same slug', async () => {
    const u1 = '11111111-1111-1111-1111-111111111111';
    const u2 = '22222222-2222-2222-2222-222222222222';
    const slug = 'duplicate-slug';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${u1}.json`),
      entryJson(u1, slug, 'Drafting'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${u2}.json`),
      entryJson(u2, slug, 'Drafting'),
    );
    const md =
      CAL_HEADER + '## Drafting\n\n' + TABLE_HEADER + calRow(u1, slug) + calRow(u2, slug) + '\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
    await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'cross-entry');
    expect(fails.some((f) => /slug/.test(f.message) && f.message.includes(slug))).toBe(true);
  });

  it('flags a sidecar whose filename uuid differs from its body uuid field', async () => {
    const filenameUuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const bodyUuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const slug = 'uuid-mismatch';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${filenameUuid}.json`),
      entryJson(bodyUuid, slug, 'Drafting'),
    );
    const md =
      CAL_HEADER + '## Drafting\n\n' + TABLE_HEADER + calRow(filenameUuid, slug) + calRow(bodyUuid, slug) + '\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
    await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'cross-entry');
    expect(fails.some((f) => /filename/i.test(f.message) || /uuid/i.test(f.message))).toBe(true);
  });

  it('passes when all sidecars have distinct slugs and matching uuids', async () => {
    const u1 = '33333333-3333-3333-3333-333333333333';
    const u2 = '44444444-4444-4444-4444-444444444444';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${u1}.json`),
      entryJson(u1, 'one', 'Drafting'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${u2}.json`),
      entryJson(u2, 'two', 'Drafting'),
    );
    const md =
      CAL_HEADER + '## Drafting\n\n' + TABLE_HEADER + calRow(u1, 'one') + calRow(u2, 'two') + '\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
    await mkdir(join(projectRoot, 'docs', 'one'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'one', 'index.md'), '');
    await mkdir(join(projectRoot, 'docs', 'two'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'two', 'index.md'), '');

    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'cross-entry');
    expect(fails).toEqual([]);
  });
});
