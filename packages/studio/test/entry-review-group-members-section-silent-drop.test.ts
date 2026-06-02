/**
 * AUDIT-20260529-37 — composed view has silent-drop vectors beyond
 * AUDIT-35.
 *
 * Two failure modes:
 *
 *   A. Stage-not-in-template drop. `bucketMembersByLane` buckets a
 *      member under `stageMap.get(member.currentStage)`, but emits only
 *      template-known stages. Members whose `currentStage` is not in
 *      the lane's template vanish from composed view AND from the
 *      swim-head `memberCount` — invisible composed↔list discrepancy.
 *
 *   B. Half-loaded lane config. `loadGroupMembersBundle` originally set
 *      `laneConfigsById.set(strict.id, strict)` BEFORE calling
 *      `loadPipelineTemplate`. If the template load threw, the lane
 *      was in `laneConfigsById` but its template was absent from
 *      `templatesById`. Members of that lane passed the
 *      `laneConfigsById.has` guard, got bucketed, then hit
 *      `template === undefined ? continue` — dropping every member of
 *      that lane from composed view, silently.
 *
 * Fix path per the audit-log entry:
 *   - (B) only `laneConfigsById.set` after the template successfully
 *     resolves (move set inside the try, below the template load).
 *   - (A) emit an "unbucketed members" tail surface (member rows that
 *     render inline with `.er-members-stage--unbucketed` styling) so
 *     stage/template mismatches surface rather than disappear.
 *
 * Per `.claude/rules/testing.md`: real fixtures on disk, no mocks.
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

describe('AUDIT-37 — composed-view silent-drop vectors', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-audit-37-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'pipelines'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe('Failure A — member stage not in lane template', () => {
    it('surfaces the member inline (does not vanish from composed view)', async () => {
      // Single lane, default editorial pipeline.
      await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');

      // Two members in the SAME lane: one with a template-known stage,
      // one with a stage NOT in the template (legacy stage / operator
      // typo / template was just trimmed). Both have a valid lane id
      // that resolves a config + template, so AUDIT-35 (lane-undefined
      // / lane-unknown) does NOT cover this case.
      await writeSidecar(projectRoot, makeEntry({
        uuid: MEMBER_A_UUID,
        slug: 'in-template',
        title: 'Member in template stage',
        currentStage: 'Drafting', // editorial linear stage
        lane: 'default',
      }));
      await writeSidecar(projectRoot, makeEntry({
        uuid: MEMBER_B_UUID,
        slug: 'not-in-template',
        title: 'Member with stage outside the template',
        // `currentStage` is a non-empty string at the schema level
        // (Phase 3 — template-driven); seeding a stage no template
        // knows about is the exact on-disk shape this bug reports.
        currentStage: 'LegacyStage',
        lane: 'default',
      }));
      await writeSidecar(projectRoot, makeEntry({
        uuid: GROUP_UUID,
        slug: 'group-with-stage-mismatch',
        title: 'Group with stage-mismatch member',
        currentStage: 'Drafting',
        lane: 'default',
        members: [MEMBER_A_UUID, MEMBER_B_UUID],
        artifactPath: 'docs/g/index.md',
      }));
      await mkdir(join(projectRoot, 'docs', 'g'), { recursive: true });
      await writeFile(join(projectRoot, 'docs', 'g', 'index.md'), '# g\n');

      const app = createApp({ projectRoot, config: cfg });
      const res = await app.fetch(
        new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}`),
      );
      expect(res.status).toBe(200);
      const html = await res.text();

      // Both UUIDs must appear in the composed view body — neither
      // member should vanish. The fix introduces an unbucketed-tail
      // rendering for stage-mismatch members.
      expect(html).toContain('data-view-mode="composed"');
      expect(html).toContain('data-member-uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
      expect(html).toContain('data-member-uuid="cccccccc-cccc-4ccc-8ccc-cccccccccccc"');

      // The unbucketed-stage member surfaces with a distinct marker so
      // the operator can see the stage/template mismatch instead of it
      // disappearing.
      expect(html).toMatch(/er-members-stage--unbucketed/);

      // The unbucketed tail has its own count (1) reflecting Member B
      // — the stage-mismatch row that previously vanished. Before the
      // fix, neither the tail nor any count for it existed at all.
      expect(html).toMatch(/data-unbucketed[\s\S]*?er-members-stage-count[^>]*>1</);
    });
  });

  describe('Failure B — lane config loaded but template load throws', () => {
    it('does not silently drop members of the half-loaded lane', async () => {
      // Two lanes. The default lane uses the built-in editorial
      // template. The "broken" lane references a pipeline template
      // whose project override is INVALID JSON — `loadPipelineTemplate`
      // throws when it tries to resolve it.
      await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');
      await writeLaneConfig(projectRoot, 'broken', 'Broken', 'broken-pipeline', 'docs');
      await writeFile(
        join(projectRoot, '.deskwork', 'pipelines', 'broken-pipeline.json'),
        '{ this is not valid json',
      );

      await writeSidecar(projectRoot, makeEntry({
        uuid: MEMBER_A_UUID,
        slug: 'in-good-lane',
        title: 'Member in working lane',
        currentStage: 'Drafting',
        lane: 'default',
      }));
      await writeSidecar(projectRoot, makeEntry({
        uuid: MEMBER_C_UUID,
        slug: 'in-broken-lane',
        title: 'Member in broken-template lane',
        currentStage: 'Drafting',
        lane: 'broken',
      }));
      await writeSidecar(projectRoot, makeEntry({
        uuid: GROUP_UUID,
        slug: 'group-with-broken-lane',
        title: 'Group spanning broken lane',
        currentStage: 'Drafting',
        lane: 'default',
        members: [MEMBER_A_UUID, MEMBER_C_UUID],
        artifactPath: 'docs/g/index.md',
      }));
      await mkdir(join(projectRoot, 'docs', 'g'), { recursive: true });
      await writeFile(join(projectRoot, 'docs', 'g', 'index.md'), '# g\n');

      const app = createApp({ projectRoot, config: cfg });
      const res = await app.fetch(
        new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}`),
      );
      expect(res.status).toBe(200);
      const html = await res.text();

      // Both members must surface — the broken-lane member must NOT
      // vanish. With the fix:
      //   * lane "broken" is NOT in laneConfigsById (template load
      //     threw, so the lane is no longer half-loaded);
      //   * the member's lane is now "unknown" from the bucketer's POV
      //     — it falls into the unbucketed tail and renders inline.
      expect(html).toContain('data-member-uuid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
      expect(html).toContain('data-member-uuid="dddddddd-dddd-4ddd-8ddd-dddddddddddd"');
      expect(html).toMatch(/er-members-stage--unbucketed/);
    });
  });
});
