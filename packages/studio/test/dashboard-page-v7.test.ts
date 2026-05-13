/**
 * Page-level integration test for the v7 dashboard (Step 2.2.9 —
 * studio-mobile-first feature workplan).
 *
 * Asserts the dashboard wires the three sections in order — Longform
 * pipeline (via stage sections) → Distribution → Shortform · by
 * platform → Adjacent tools — and surfaces the v7 masthead meta with
 * both longform + shortform counts.
 *
 * Per .claude/rules/ui-verification.md, every assertion captures a
 * spec-derived visible promise.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import { createApp } from '../src/server.ts';

const UUID_DRAFTING = '11111111-1111-4111-8111-111111111111';
const UUID_PUBLISHED = '22222222-2222-4222-8222-222222222222';

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

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    uuid: UUID_DRAFTING,
    slug: 'placeholder',
    title: 'Placeholder',
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: { Drafting: 0 },
    createdAt: '2026-05-10T10:00:00.000Z',
    updatedAt: '2026-05-10T10:00:00.000Z',
    ...overrides,
  };
}

async function getHtml(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; html: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, html: await res.text() };
}

describe('dashboard v7 page wiring (Step 2.2.9)', () => {
  let root: string;
  let config: DeskworkConfig;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-dash-v7-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    config = makeConfig();
    app = createApp({ projectRoot: root, config });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders Longform → Distribution → Shortform → Adjacent in that order', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // Pick one marker per section that uniquely identifies it.
    const longformIdx = r.html.indexOf('data-stage-section="Ideas"');
    const distributionIdx = r.html.indexOf(
      'data-stage-section="Distribution"',
    );
    const shortformHeadIdx = r.html.indexOf(
      'er-desk-section-head--shortform',
    );
    const adjacentHeadIdx = r.html.indexOf(
      'er-desk-section-head--adjacent',
    );

    expect(longformIdx).toBeGreaterThan(-1);
    expect(distributionIdx).toBeGreaterThan(longformIdx);
    expect(shortformHeadIdx).toBeGreaterThan(distributionIdx);
    expect(adjacentHeadIdx).toBeGreaterThan(shortformHeadIdx);
  });

  it('masthead reads "{n} longform" when no shortform workflows exist', async () => {
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_DRAFTING,
        slug: 'a-draft',
        currentStage: 'Drafting',
      }),
    );
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('1 longform');
    // Does NOT include a misleading "0 shortform" claim.
    expect(r.html).not.toContain('0 shortform');
  });

  it('masthead reads "{n} longform · {m} shortform" when shortform workflows exist', async () => {
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_DRAFTING,
        slug: 'a-draft',
        currentStage: 'Drafting',
      }),
    );
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_PUBLISHED,
        slug: 'a-published',
        currentStage: 'Published',
      }),
    );
    createWorkflow(root, config, {
      site: 'd',
      slug: 'a-published',
      contentKind: 'shortform',
      platform: 'linkedin',
      initialMarkdown: 'draft body',
    });
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('2 longform · 1 shortform');
  });

  it('existing longform stage tiles carry data-stage-section-group="longform"', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Each of the 8 stage tiles + Distribution should carry the group attr.
    const matches = r.html.match(/data-stage-section-group="longform"/g) ?? [];
    // 8 stage tiles + 1 Distribution = 9.
    expect(matches.length).toBeGreaterThanOrEqual(9);
  });

  it('shortform tiles carry data-stage-section-group="shortform"', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // 4 platform tiles.
    const matches = r.html.match(/data-stage-section-group="shortform"/g) ?? [];
    expect(matches.length).toBe(4);
  });

  it('renders a shortform row for each open workflow, in the right platform group', async () => {
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_PUBLISHED,
        slug: 'my-post',
        currentStage: 'Published',
      }),
    );
    createWorkflow(root, config, {
      site: 'd',
      slug: 'my-post',
      contentKind: 'shortform',
      platform: 'reddit',
      channel: 'r/programming',
      initialMarkdown: 'reddit body',
    });
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The row carries the slug + the channel.
    expect(r.html).toContain('my-post');
    expect(r.html).toContain('r/programming');
    // Inside the Reddit platform group.
    expect(r.html).toMatch(
      /data-stage-section="shortform-reddit"[^>]*>[\s\S]*?my-post/,
    );
  });

  it('per Commandment III: no er-stamp chrome surfaces anywhere on the page, even with shortform workflows', async () => {
    await writeSidecar(
      root,
      makeEntry({
        uuid: UUID_PUBLISHED,
        slug: 'my-post',
        currentStage: 'Published',
      }),
    );
    createWorkflow(root, config, {
      site: 'd',
      slug: 'my-post',
      contentKind: 'shortform',
      platform: 'youtube',
      initialMarkdown: 'yt body',
    });
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Neither the legacy `.er-stamp-<state>` nor a generic `er-stamp`
    // class should appear in the v7 dashboard markup. (The class only
    // exists on the legacy /dev/editorial-review-shortform page, which
    // Step 2.2.10 retires.)
    expect(r.html).not.toMatch(/class="[^"]*\ber-stamp\b/);
  });

  it('loads the new dashboard-desk-sections.css stylesheet alongside the existing ones', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('/static/css/dashboard-desk-sections.css');
    // Existing stylesheets still present.
    expect(r.html).toContain('/static/css/dashboard-mobile.css');
    expect(r.html).toContain('/static/css/dashboard-row-affordances.css');
  });
});
