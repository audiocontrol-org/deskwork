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

function calendarRow(uuid: string, slug: string): string {
  return `| ${uuid} | ${slug} | T-${slug} |  |  |  | ${NOW} |\n`;
}

describe('validateAll - calendar-sidecar', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('flags an orphan calendar row (uuid in calendar.md but no sidecar)', async () => {
    const orphanUuid = '11111111-1111-1111-1111-111111111111';
    const sidecarUuid = '22222222-2222-2222-2222-222222222222';

    // Calendar.md lists orphanUuid under Drafting
    const md =
      CAL_HEADER +
      '## Ideas\n\n*No entries.*\n\n' +
      '## Planned\n\n*No entries.*\n\n' +
      '## Outlining\n\n*No entries.*\n\n' +
      '## Drafting\n\n' + TABLE_HEADER + calendarRow(orphanUuid, 'orphan-cal') + '\n' +
      '## Final\n\n*No entries.*\n\n' +
      '## Published\n\n*No entries.*\n\n' +
      '## Blocked\n\n*No entries.*\n\n' +
      '## Cancelled\n\n*No entries.*\n\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);

    // Sidecar with a different uuid
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${sidecarUuid}.json`),
      entryJson(sidecarUuid, 'orphan-side', 'Drafting'),
    );

    const result = await validateAll(projectRoot);
    const calSideFails = result.failures.filter((f) => f.category === 'calendar-sidecar');
    expect(calSideFails.length).toBe(2);
    expect(calSideFails.some((f) => f.entryId === orphanUuid)).toBe(true);
    expect(calSideFails.some((f) => f.entryId === sidecarUuid)).toBe(true);
  });

  it('flags a sidecar with no calendar row when calendar.md is empty', async () => {
    const sidecarUuid = '33333333-3333-3333-3333-333333333333';
    const md =
      CAL_HEADER +
      '## Ideas\n\n*No entries.*\n\n' +
      '## Drafting\n\n*No entries.*\n\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${sidecarUuid}.json`),
      entryJson(sidecarUuid, 'lonely', 'Drafting'),
    );

    const result = await validateAll(projectRoot);
    const calSideFails = result.failures.filter((f) => f.category === 'calendar-sidecar');
    expect(calSideFails.length).toBe(1);
    expect(calSideFails[0].entryId).toBe(sidecarUuid);
  });

  it('passes when calendar.md and sidecars agree', async () => {
    const u = '44444444-4444-4444-4444-444444444444';
    const md =
      CAL_HEADER +
      '## Drafting\n\n' + TABLE_HEADER + calendarRow(u, 'agree') + '\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${u}.json`),
      entryJson(u, 'agree', 'Drafting'),
    );

    const result = await validateAll(projectRoot);
    const calSideFails = result.failures.filter((f) => f.category === 'calendar-sidecar');
    expect(calSideFails).toEqual([]);
  });

  // #148: when sidecar.currentStage disagrees with the section the entry
  // appears under in calendar.md, surface as a calendar-sidecar finding
  // (so --check actually exits non-zero on drift instead of reporting
  // clean while --fix=all unconditionally regenerates).
  it('flags drift when calendar.md section does not match sidecar.currentStage (#148)', async () => {
    const u = '55555555-5555-5555-5555-555555555555';
    // calendar.md shows the entry under Planned…
    const md =
      CAL_HEADER +
      '## Planned\n\n' + TABLE_HEADER + calendarRow(u, 'drifty') + '\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
    // …but the sidecar says Drafting.
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${u}.json`),
      entryJson(u, 'drifty', 'Drafting'),
    );

    const result = await validateAll(projectRoot);
    const calSideFails = result.failures.filter((f) => f.category === 'calendar-sidecar');
    expect(calSideFails).toHaveLength(1);
    expect(calSideFails[0].message).toContain('Planned');
    expect(calSideFails[0].message).toContain('Drafting');
    expect(calSideFails[0].entryId).toBe(u);
  });

  it('does not flag drift when calendar.md section matches sidecar.currentStage', async () => {
    const u = '66666666-6666-6666-6666-666666666666';
    const md =
      CAL_HEADER +
      '## Drafting\n\n' + TABLE_HEADER + calendarRow(u, 'aligned') + '\n';
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${u}.json`),
      entryJson(u, 'aligned', 'Drafting'),
    );

    const result = await validateAll(projectRoot);
    const calSideFails = result.failures.filter((f) => f.category === 'calendar-sidecar');
    expect(calSideFails).toEqual([]);
  });
});
