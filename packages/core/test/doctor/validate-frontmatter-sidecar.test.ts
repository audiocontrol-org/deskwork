import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';

const NOW = '2026-04-30T12:00:00.000Z';

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

const CAL_HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER =
  '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';

function calRow(uuid: string, slug: string): string {
  return `| ${uuid} | ${slug} | T-${slug} |  |  |  | ${NOW} |\n`;
}

function calendarMd(uuid: string, slug: string, stage: string): string {
  return CAL_HEADER + `## ${stage}\n\n` + TABLE_HEADER + calRow(uuid, slug) + '\n';
}

describe('validateAll - frontmatter-sidecar', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('flags a Drafting sidecar whose index.md frontmatter says Outlining', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const slug = 'mismatch';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
    const fm = `---
title: T-mismatch
deskwork:
  id: ${uuid}
  stage: Outlining
---

body
`;
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), fm);

    const result = await validateAll(projectRoot);
    const fmFails = result.failures.filter((f) => f.category === 'frontmatter-sidecar');
    expect(fmFails.length).toBe(1);
    expect(fmFails[0].entryId).toBe(uuid);
  });

  it('passes when frontmatter and sidecar agree', async () => {
    const uuid = '22222222-2222-2222-2222-222222222222';
    const slug = 'agreed';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
    const fm = `---
title: T-agreed
deskwork:
  id: ${uuid}
  stage: Drafting
---

body
`;
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), fm);

    const result = await validateAll(projectRoot);
    const fmFails = result.failures.filter((f) => f.category === 'frontmatter-sidecar');
    expect(fmFails).toEqual([]);
  });

  it('does NOT push a frontmatter failure when artifact is missing (file-presence covers that)', async () => {
    const uuid = '33333333-3333-3333-3333-333333333333';
    const slug = 'missing-artifact';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );

    const result = await validateAll(projectRoot);
    const fmFails = result.failures.filter((f) => f.category === 'frontmatter-sidecar');
    expect(fmFails).toEqual([]);
  });

  it('uses scrapbook/idea.md path for Ideas-stage sidecar', async () => {
    const uuid = '44444444-4444-4444-4444-444444444444';
    const slug = 'ideas-mismatch';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Ideas'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Ideas'),
    );
    await mkdir(join(projectRoot, 'docs', slug, 'scrapbook'), { recursive: true });
    const fm = `---
title: T-ideas
deskwork:
  id: ${uuid}
  stage: Planned
---

body
`;
    await writeFile(join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md'), fm);

    const result = await validateAll(projectRoot);
    const fmFails = result.failures.filter((f) => f.category === 'frontmatter-sidecar');
    expect(fmFails.length).toBe(1);
    expect(fmFails[0].entryId).toBe(uuid);
  });
});
