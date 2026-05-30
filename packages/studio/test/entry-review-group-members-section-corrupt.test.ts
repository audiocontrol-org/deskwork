/**
 * AUDIT-20260529-39 — corrupt member sidecars must NOT be misreported
 * as missing.
 *
 * `loadGroupMembersBundle` previously caught every `readSidecar`
 * failure and recorded the UUID as missing. That conflated a genuinely
 * absent sidecar (ENOENT) with schema-parse failures, malformed JSON,
 * or other I/O errors — violating the project's no-silent-fallbacks
 * discipline and hiding data corruption from the operator.
 *
 * Fix: distinguish ENOENT from other readSidecar failures. ENOENT
 * stays in the "missing" surface (the operator-recognizable "member
 * not on disk" case). All other failures surface as a distinct
 * "corrupt" row so the operator sees the corruption inline instead of
 * having it laundered as a missing sidecar.
 *
 * Per `.claude/rules/testing.md`: real fixtures, no mocks. We seed a
 * sidecar file with literal `not-json` content and assert the
 * renderer surfaces it as corrupt — not as missing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '@/server.ts';

const GROUP_UUID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER_GOOD_UUID    = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER_MISSING_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MEMBER_CORRUPT_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: { d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
    defaultSite: 'd',
  };
}

function makeEntry(
  overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>,
): Entry {
  return {
    keywords: [],
    source: 'manual',
    iterationByStage: { [overrides.currentStage]: 1 },
    createdAt: '2026-05-29T10:00:00.000Z',
    updatedAt: '2026-05-29T10:00:00.000Z',
    ...overrides,
  } as Entry;
}

function writeLaneConfig(
  root: string,
  id: string,
  name: string,
  pipeline: string,
  contentDir: string,
): Promise<void> {
  return writeFile(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
  );
}

describe('AUDIT-39 — corrupt member sidecar distinguished from missing', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-audit-39-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');

    // One real, resolvable member sidecar.
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_GOOD_UUID,
      slug: 'good-member',
      title: 'Good resolvable member',
      currentStage: 'Drafting',
      lane: 'default',
    }));

    // One corrupt sidecar: file exists on disk but the JSON is
    // invalid. readSidecar throws a non-ENOENT error.
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${MEMBER_CORRUPT_UUID}.json`),
      'this is { not valid json',
    );

    // MEMBER_MISSING is referenced by the group but its sidecar is
    // deliberately NOT written — readSidecar throws ENOENT.

    // Group sidecar referencing all three.
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_UUID,
      slug: 'mixed-resolution',
      title: 'Mixed-resolution group',
      currentStage: 'Drafting',
      lane: 'default',
      members: [MEMBER_GOOD_UUID, MEMBER_MISSING_UUID, MEMBER_CORRUPT_UUID],
      artifactPath: 'docs/g/index.md',
    }));
    await mkdir(join(projectRoot, 'docs', 'g'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'g', 'index.md'), '# g\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders the corrupt member with a distinct "corrupt" marker (not as missing)', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}?members=list`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    // The corrupt UUID surfaces under the corrupt marker — NOT under
    // the missing marker. Before the fix, the corrupt member rendered
    // with `er-member-row--missing` (silent-fallback violation).
    expect(html).toContain('data-corrupt-uuid="dddddddd-dddd-4ddd-8ddd-dddddddddddd"');
    expect(html).toMatch(/er-member-row--corrupt/);

    // The genuinely-missing member still appears with the missing
    // marker. The two failure modes must be visually distinguishable.
    expect(html).toContain('data-missing-uuid="cccccccc-cccc-4ccc-8ccc-cccccccccccc"');
    expect(html).toMatch(/er-member-row--missing/);

    // The good member still resolves normally.
    expect(html).toContain('data-member-uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');

    // Belt-and-suspenders: the corrupt UUID is NOT also leaking into
    // the missing surface (the silent-fallback violation).
    expect(html).not.toContain('data-missing-uuid="dddddddd-dddd-4ddd-8ddd-dddddddddddd"');
  });
});
