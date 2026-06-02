/**
 * Regression test for AUDIT-20260530-89 (cross-model:
 * AUDIT-BARRAGE-claude-P7T7.2). Mirrors the AUDIT-20260530-23 fix
 * in `cancel.ts`: `showGroup`'s member-enrichment loop must narrow
 * its recoverable-skip case to the genuinely-absent sidecar
 * (probed via `existsSync(sidecarPath(...))`) and let parse /
 * schema / IO errors from `readSidecar` propagate.
 *
 * The bug: the per-member loop wrapped `readSidecar` in a bare
 * `catch {}` that pushed `{ uuid, missing: true }` for ANY thrown
 * error — so a corrupt-but-on-disk sidecar was reported the same
 * shape as a dangling UUID. Doctor's `group-member-missing` rule
 * then prompts the operator to *delete* the reference, compounding
 * the data loss.
 *
 * The contract this test pins:
 *
 *   - Member whose sidecar parses cleanly → enriched normally,
 *     missing: false.
 *   - Member whose sidecar file does not exist → labeled
 *     missing: true (the historical contract; preserved by the
 *     fix).
 *   - Member whose sidecar file EXISTS but is corrupt JSON →
 *     the parse error propagates from `showGroup` (NOT silently
 *     labeled missing). Operator sees real corruption, not a
 *     dangling-UUID false positive.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { showGroup } from '@/groups';
import { writeSidecar } from '@/sidecar/write.ts';
import { sidecarPath } from '@/sidecar/paths.ts';
import type { Entry } from '@/schema/entry.ts';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'dw-groups-show-corrupt-'));
  mkdirSync(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
  writeFileSync(
    join(projectRoot, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  writeFileSync(
    join(projectRoot, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
  writeFileSync(
    join(projectRoot, '.deskwork', 'lanes', 'default.json'),
    JSON.stringify({
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
      contentDir: 'docs',
    }),
    'utf-8',
  );
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function makeEntry(uuid: string, slug: string, overrides: Partial<Entry> = {}): Entry {
  return {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: {},
    lane: 'default',
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('showGroup — AUDIT-20260530-89: corrupt member sidecar must NOT be mislabeled as missing', () => {
  it('propagates a parse error for a corrupt member sidecar (does NOT silently label it missing)', async () => {
    const m1 = '550e8400-e29b-41d4-a716-446655441001';
    const m2 = '550e8400-e29b-41d4-a716-446655441002';
    const m3 = '550e8400-e29b-41d4-a716-446655441003';
    const groupUuid = '550e8400-e29b-41d4-a716-446655441000';

    await writeSidecar(projectRoot, makeEntry(m1, 'm1'));
    await writeSidecar(projectRoot, makeEntry(m3, 'm3'));
    // Member-2's sidecar file EXISTS but is corrupt JSON — this is
    // the case the pre-fix code mislabeled as `missing: true`.
    writeFileSync(sidecarPath(projectRoot, m2), '{not valid json', 'utf-8');
    await writeSidecar(
      projectRoot,
      makeEntry(groupUuid, 'g-corrupt', { members: [m1, m2, m3] }),
    );

    await expect(showGroup(projectRoot, 'g-corrupt')).rejects.toThrow(
      /sidecar JSON invalid/,
    );
  });

  it('still labels a genuinely-absent member sidecar with missing: true (true dangling case preserved)', async () => {
    const present = '550e8400-e29b-41d4-a716-446655441010';
    const absent = '550e8400-e29b-41d4-a716-446655441011';
    const groupUuid = '550e8400-e29b-41d4-a716-446655441012';

    await writeSidecar(projectRoot, makeEntry(present, 'present'));
    await writeSidecar(
      projectRoot,
      makeEntry(groupUuid, 'g-dangling', { members: [present, absent] }),
    );

    const result = await showGroup(projectRoot, 'g-dangling');
    expect(result.members).toHaveLength(2);
    expect(result.members[0]).toMatchObject({
      uuid: present,
      slug: 'present',
      missing: false,
    });
    expect(result.members[1]).toMatchObject({ uuid: absent, missing: true });
    expect(result.members[1].slug).toBeUndefined();
  });
});
