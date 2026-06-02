/**
 * Phase 7 Tasks 7.3 + 7.4 — composed-mode rendering of the entry-review
 * Members section (Direction B brief, default mode).
 *
 * Asserts that the composed view emits one `.er-members-swim` block per
 * lane the group's members span, each carrying its template's stage
 * sequence (linear + off-pipeline), with the lane-scoped per-stage
 * counts and `is-empty` modifiers per the dashboard convention.
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
const MEMBER_C_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

describe('entry-review Members section — composed mode (Phase 7 Task 7.4)', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-er-members-composed-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');
    await writeLaneConfig(projectRoot, 'mockups', 'Mockups', 'visual', 'mockups');

    // Two editorial members in different stages + one visual member.
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_A_UUID,
      slug: 'row-chrome',
      title: 'Row chrome rewrite',
      currentStage: 'Drafting',
      lane: 'default',
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_B_UUID,
      slug: 'stage-verb-router',
      title: 'Stage-aware verb router',
      currentStage: 'Final',
      lane: 'default',
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_C_UUID,
      slug: 'row-3-swipe-mockup',
      title: 'Row-3 swipe mockup',
      currentStage: 'Sketched',
      lane: 'mockups',
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_UUID,
      slug: 'v018-rebuild',
      title: 'v0.18 row rebuild',
      currentStage: 'Drafting',
      lane: 'default',
      members: [MEMBER_A_UUID, MEMBER_B_UUID, MEMBER_C_UUID],
      artifactPath: 'docs/v018-rebuild/index.md',
    }));
    await mkdir(join(projectRoot, 'docs', 'v018-rebuild'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'v018-rebuild', 'index.md'), '# v0.18 row rebuild\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders the composed view as default with one lane block per spanned lane', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    // Members section in composed mode (server-side default).
    expect(html).toContain('data-members-section');
    expect(html).toContain('data-view-mode="composed"');
    expect(html).toContain('data-composed');

    // One swim block per spanned lane.
    expect(html).toContain('data-lane-id="default"');
    expect(html).toContain('data-lane-id="mockups"');
    expect(html).toContain('data-template-id="editorial"');
    expect(html).toContain('data-template-id="visual"');

    // Per-stage cards for each member, attributed to their lane.
    expect(html).toContain('data-member-uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
    expect(html).toContain('data-member-uuid="cccccccc-cccc-4ccc-8ccc-cccccccccccc"');
    expect(html).toContain('data-member-uuid="dddddddd-dddd-4ddd-8ddd-dddddddddddd"');

    // Empty editorial stages render with `is-empty` per the dashboard
    // convention — pipeline shape stays visible. Editorial has Ideas /
    // Planned / Outlining / Drafting / Final / Published as linear
    // stages; only Drafting (Member A) and Final (Member B) are
    // populated, so at least one editorial stage should carry is-empty.
    expect(html).toMatch(/er-members-stage is-empty/);

    // Stage glyphs surfaced (press-check vocabulary per
    // DESKWORK-STATE-MACHINE.md).
    expect(html).toMatch(/er-members-stage-glyph[^>]*>[◇§⊹✎※✓⊘✗◦]/);
  });
});
