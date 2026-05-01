import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';
import { appendJournalEvent } from '@/journal/append';

const NOW = '2026-04-30T12:00:00.000Z';
const EARLIER = '2026-04-29T12:00:00.000Z';
const EVEN_EARLIER = '2026-04-28T12:00:00.000Z';

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
  reviewState?: string,
): string {
  const obj: Record<string, unknown> = {
    uuid,
    slug,
    title: `T-${slug}`,
    keywords: [],
    source: '',
    currentStage: stage,
    iterationByStage: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  if (reviewState !== undefined) obj.reviewState = reviewState;
  return JSON.stringify(obj);
}

describe('validateAll - journal-sidecar', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('flags when latest stage-transition.to disagrees with sidecar.currentStage', async () => {
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
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');

    // older stage-transition: Outlining
    await appendJournalEvent(projectRoot, {
      kind: 'stage-transition',
      at: EARLIER,
      entryId: uuid,
      from: 'Planned',
      to: 'Outlining',
    });
    // newer stage-transition: Final  (should match sidecar.currentStage to be clean,
    // but sidecar says Drafting -> mismatch)
    await appendJournalEvent(projectRoot, {
      kind: 'stage-transition',
      at: NOW,
      entryId: uuid,
      from: 'Outlining',
      to: 'Final',
    });

    const result = await validateAll(projectRoot);
    const journalFails = result.failures.filter((f) => f.category === 'journal-sidecar');
    expect(journalFails.length).toBeGreaterThanOrEqual(1);
    expect(journalFails.some((f) => f.entryId === uuid && /Final/.test(f.message))).toBe(true);
  });

  it('passes when latest stage-transition.to matches sidecar.currentStage', async () => {
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
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');

    await appendJournalEvent(projectRoot, {
      kind: 'stage-transition',
      at: EVEN_EARLIER,
      entryId: uuid,
      from: 'Outlining',
      to: 'Drafting',
    });

    const result = await validateAll(projectRoot);
    const journalFails = result.failures.filter((f) => f.category === 'journal-sidecar');
    expect(journalFails).toEqual([]);
  });

  it('flags when latest review-state-change.to disagrees with sidecar.reviewState', async () => {
    const uuid = '33333333-3333-3333-3333-333333333333';
    const slug = 'review-mismatch';
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      entryJson(uuid, slug, 'Drafting', 'in-review'),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'calendar.md'),
      calendarMd(uuid, slug, 'Drafting'),
    );
    await mkdir(join(projectRoot, 'docs', slug), { recursive: true });
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '');

    await appendJournalEvent(projectRoot, {
      kind: 'review-state-change',
      at: NOW,
      entryId: uuid,
      stage: 'Drafting',
      from: 'in-review',
      to: 'approved',
    });

    const result = await validateAll(projectRoot);
    const journalFails = result.failures.filter((f) => f.category === 'journal-sidecar');
    expect(journalFails.some((f) => f.entryId === uuid && /review/.test(f.message))).toBe(true);
  });

  it('treats undefined sidecar.reviewState as null when comparing against journal', async () => {
    const uuid = '44444444-4444-4444-4444-444444444444';
    const slug = 'review-null';
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

    await appendJournalEvent(projectRoot, {
      kind: 'review-state-change',
      at: NOW,
      entryId: uuid,
      stage: 'Drafting',
      from: 'approved',
      to: null,
    });

    const result = await validateAll(projectRoot);
    const journalFails = result.failures.filter((f) => f.category === 'journal-sidecar');
    const reviewFails = journalFails.filter((f) => /review/.test(f.message));
    expect(reviewFails).toEqual([]);
  });
});
