/**
 * Phase 7 Tasks 7.3 + 7.4 — empty-state fallback for the Members
 * section (Direction B brief).
 *
 * A group with `members: []` AND NO `artifactPath` renders the
 * centered empty-state CTA per the accepted mockup — "+ Add member"
 * button carrying a clipboard-copy template.
 *
 * A group with `members: []` BUT WITH an `artifactPath` skips the
 * section entirely (the existing artifactPath body renderer is the
 * intended fallback per the brief).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '@/server.ts';

const GROUP_EMPTY_NO_BODY_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GROUP_EMPTY_WITH_BODY_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

describe('entry-review Members section — empty-state fallback (Phase 7 Task 7.4)', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-er-members-empty-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');

    // Declared-empty group with NO artifactPath — must render the
    // empty-state CTA. The entry resolver needs an artifact body to
    // not 404, so we seed the slug's index.md (the fallback path).
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_EMPTY_NO_BODY_UUID,
      slug: 'empty-group-no-body',
      title: 'Empty group, no body',
      currentStage: 'Ideas',
      lane: 'default',
      members: [],
    }));
    await mkdir(join(projectRoot, 'docs', 'empty-group-no-body'), { recursive: true });
    await writeFile(
      join(projectRoot, 'docs', 'empty-group-no-body', 'index.md'),
      '# Empty group, no body\n',
    );

    // Declared-empty group WITH artifactPath — must NOT render the
    // members section (the existing artifactPath body is the fallback).
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_EMPTY_WITH_BODY_UUID,
      slug: 'empty-group-with-body',
      title: 'Empty group, with body',
      currentStage: 'Ideas',
      lane: 'default',
      members: [],
      artifactPath: 'docs/empty-group-with-body/index.md',
    }));
    await mkdir(join(projectRoot, 'docs', 'empty-group-with-body'), { recursive: true });
    await writeFile(
      join(projectRoot, 'docs', 'empty-group-with-body', 'index.md'),
      '# Empty group with body\n',
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders the empty-state CTA for declared-empty groups without artifactPath', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${GROUP_EMPTY_NO_BODY_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('data-members-section');
    expect(html).toContain('er-members-section--empty');
    expect(html).toContain('data-empty-cta');
    expect(html).toContain('No members yet');
    // The CTA carries the clipboard-copy template per the mockup.
    expect(html).toMatch(/data-copy-text="\/deskwork:group add-member empty-group-no-body/);
  });

  it('does NOT render the members section for declared-empty groups WITH an artifactPath', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${GROUP_EMPTY_WITH_BODY_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).not.toContain('data-members-section');
    expect(html).not.toContain('er-members-section');
  });
});
