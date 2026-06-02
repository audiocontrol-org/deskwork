/**
 * Phase 7 Tasks 7.3 + 7.4 — list-mode rendering of the entry-review
 * Members section (Direction B brief).
 *
 * Integration test: builds a tmp fixture with a populated group (2
 * members across 2 lanes / different stages), hits the entry-review
 * URL with `?members=list`, and asserts the rendered HTML carries the
 * "Members" section title, both member rows with the expected slugs +
 * titles + lane tags + stage glyphs, and clipboard-copy links pointing
 * at each member's review surface.
 *
 * Per `.claude/rules/testing.md`: real sidecars, real lane configs,
 * real pipeline templates. No mocks.
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
const MEMBER_A_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER_B_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'd',
  };
}

function makeEntry(overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>): Entry {
  return {
    keywords: [],
    source: 'manual',
    iterationByStage: { [overrides.currentStage]: 1 },
    createdAt: '2026-05-29T10:00:00.000Z',
    updatedAt: '2026-05-29T10:00:00.000Z',
    ...overrides,
  } as Entry;
}

function writeLaneConfig(root: string, id: string, name: string, pipeline: string, contentDir: string): Promise<void> {
  return writeFile(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
  );
}

describe('entry-review Members section — list mode (Phase 7 Task 7.3)', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-er-members-list-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');
    await writeLaneConfig(projectRoot, 'mockups', 'Mockups', 'visual', 'mockups');

    // Two members + one group sidecar.
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_A_UUID,
      slug: 'row-chrome-cascade',
      title: 'Row chrome cascade rewrite',
      currentStage: 'Drafting',
      lane: 'default',
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_B_UUID,
      slug: 'row-3-swipe-mockup',
      title: 'Row-3 swipe-only direction',
      currentStage: 'Sketched',
      lane: 'mockups',
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_UUID,
      slug: 'v018-rebuild',
      title: 'v0.18 row rebuild',
      currentStage: 'Drafting',
      lane: 'default',
      members: [MEMBER_A_UUID, MEMBER_B_UUID],
      artifactPath: 'docs/v018-rebuild/index.md',
    }));
    await mkdir(join(projectRoot, 'docs', 'v018-rebuild'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'v018-rebuild', 'index.md'), '# v0.18 row rebuild\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders the Members section with a list of both members in list mode', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}?members=list`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    // Section is present.
    expect(html).toContain('data-members-section');
    expect(html).toContain('data-group-uuid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
    expect(html).toContain('data-view-mode="list"');
    expect(html).toContain('>Members<');

    // Both member rows render with their slugs and titles.
    expect(html).toContain('data-member-uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
    expect(html).toContain('data-member-uuid="cccccccc-cccc-4ccc-8ccc-cccccccccccc"');
    expect(html).toContain('Row chrome cascade rewrite');
    expect(html).toContain('row-chrome-cascade');
    expect(html).toContain('Row-3 swipe-only direction');
    expect(html).toContain('row-3-swipe-mockup');

    // Clipboard-copy links target the per-member review surface.
    expect(html).toContain(`href="/dev/editorial-review/entry/${MEMBER_A_UUID}"`);
    expect(html).toContain(`href="/dev/editorial-review/entry/${MEMBER_B_UUID}"`);
    expect(html).toContain('data-member-copy');

    // Lane tags surfaced per the accepted brief.
    expect(html).toMatch(/er-member-row-lane[^>]*>Editorial/);
    expect(html).toMatch(/er-member-row-lane[^>]*>Mockups/);

    // Stage names visible (DESKWORK-STATE-MACHINE.md Commandment II).
    expect(html).toContain('>Drafting<');
    expect(html).toContain('>Sketched<');
  });
});
