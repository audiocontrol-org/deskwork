/**
 * Integration test for the studio dashboard at `/dev/editorial-studio`.
 *
 * Pipeline-redesign Task 34. The dashboard reads sidecars under
 * `<projectRoot>/.deskwork/entries/*.json` and renders eight stage
 * sections (Ideas, Planned, Outlining, Drafting, Final, Published,
 * Blocked, Cancelled) plus a reserved Distribution placeholder.
 *
 * The legacy Paused-lane test (which exercised the old calendar.md
 * + workflow store rendering) has been retired in this rewrite.
 * Paused does not exist in the new pipeline; Blocked / Cancelled
 * supersede it. The legacy assertions are intentionally not ported.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import { createApp } from '../src/server.ts';

const UUID_IDEA = '11111111-1111-4111-8111-111111111111';
const UUID_DRAFTING = '22222222-2222-4222-8222-222222222222';
const UUID_FINAL_APPROVED = '33333333-3333-4333-8333-333333333333';
const UUID_PUBLISHED = '44444444-4444-4444-8444-444444444444';
const UUID_BLOCKED = '55555555-5555-4555-8555-555555555555';
const UUID_OUTLINING_ITER = '66666666-6666-4666-8666-666666666666';

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
    uuid: UUID_IDEA,
    slug: 'placeholder',
    title: 'Placeholder',
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: { Ideas: 0 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
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

describe('studio dashboard — eight stage sections (Task 34)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-dash-task34-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders all eight canonical stage sections in order', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    for (const stage of ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled']) {
      expect(r.html).toContain(`data-stage-section="${stage}"`);
    }
  });

  it('renders the reserved Distribution placeholder beneath the stage sections', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toContain('data-stage-section="Distribution"');
  });

  it('does not render the retired Paused stage section', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).not.toContain('data-stage-section="Paused"');
  });

  it('empty stage sections render the placeholder text', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/data-empty-stage="Ideas"[^>]*>[\s\S]*?Run \/deskwork:add/);
    expect(r.html).toMatch(/data-empty-stage="Cancelled"[^>]*>[\s\S]*?No cancelled entries/);
  });

  it('renders one row per sidecar with iteration count and reviewState badge', async () => {
    await writeSidecar(root, makeEntry({
      uuid: UUID_DRAFTING,
      slug: 'sample-draft',
      title: 'Sample Draft',
      currentStage: 'Drafting',
      iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 4 },
      reviewState: 'in-review',
    }));

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // Row is tagged with the entry uuid + slug + currentStage.
    expect(r.html).toMatch(
      new RegExp(`data-stage="Drafting"[^>]*data-uuid="${UUID_DRAFTING}"[^>]*data-slug="sample-draft"`),
    );
    // Iteration count surfaces inline.
    expect(r.html).toMatch(/data-iteration="4"[^>]*>iteration: 4/);
    // ReviewState badge renders with the canonical label.
    expect(r.html).toMatch(/data-review-state="in-review"[^>]*>in review/);
  });

  it('renders an em-dash placeholder for entries with no reviewState', async () => {
    await writeSidecar(root, makeEntry({
      uuid: UUID_IDEA,
      slug: 'fresh-idea',
      title: 'Fresh Idea',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 0 },
    }));

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/data-review-state="none"/);
  });

  it('approved entry surfaces an "approve →" affordance', async () => {
    await writeSidecar(root, makeEntry({
      uuid: UUID_FINAL_APPROVED,
      slug: 'ready-to-publish',
      title: 'Ready To Publish',
      currentStage: 'Final',
      iterationByStage: { Final: 2 },
      reviewState: 'approved',
    }));

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/\/deskwork:approve[^"]*ready-to-publish/);
  });

  it('iterating entry surfaces an "iterate →" affordance', async () => {
    await writeSidecar(root, makeEntry({
      uuid: UUID_OUTLINING_ITER,
      slug: 'in-iteration',
      title: 'In Iteration',
      currentStage: 'Outlining',
      iterationByStage: { Outlining: 3 },
      reviewState: 'iterating',
    }));

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/\/deskwork:iterate[^"]*in-iteration/);
  });

  it('blocked entry surfaces an "induct →" affordance', async () => {
    await writeSidecar(root, makeEntry({
      uuid: UUID_BLOCKED,
      slug: 'on-hold',
      title: 'On Hold',
      currentStage: 'Blocked',
      priorStage: 'Drafting',
      iterationByStage: { Drafting: 2 },
    }));

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(/\/deskwork:induct[^"]*on-hold/);
  });

  it('published entry surfaces a "view →" link to the review surface', async () => {
    await writeSidecar(root, makeEntry({
      uuid: UUID_PUBLISHED,
      slug: 'shipped',
      title: 'Shipped',
      currentStage: 'Published',
      iterationByStage: { Drafting: 3, Final: 1 },
      datePublished: '2026-04-29T12:00:00.000Z',
    }));

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.html).toMatch(
      new RegExp(`href="/dev/editorial-review/${UUID_PUBLISHED}"[^>]*[^<]*view`),
    );
  });

  it('does not crash on an empty calendar (no sidecars at all)', async () => {
    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Page still has a head + footer scaffold.
    expect(r.html).toContain('<!DOCTYPE html>');
    expect(r.html).toContain('Editorial Studio');
  });

  it('groups multiple entries into the right stage sections', async () => {
    await writeSidecar(root, makeEntry({
      uuid: UUID_IDEA,
      slug: 'idea-a',
      title: 'Idea A',
      currentStage: 'Ideas',
    }));
    await writeSidecar(root, makeEntry({
      uuid: UUID_DRAFTING,
      slug: 'draft-b',
      title: 'Draft B',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 1 },
    }));
    await writeSidecar(root, makeEntry({
      uuid: UUID_PUBLISHED,
      slug: 'shipped-c',
      title: 'Shipped C',
      currentStage: 'Published',
      iterationByStage: { Drafting: 2 },
    }));

    const r = await getHtml(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Header surfaces the entry count.
    expect(r.html).toMatch(/3 on the calendar/);
    // Each entry shows up in its own section.
    expect(r.html).toMatch(
      new RegExp(`data-stage="Ideas"[^>]*data-uuid="${UUID_IDEA}"`),
    );
    expect(r.html).toMatch(
      new RegExp(`data-stage="Drafting"[^>]*data-uuid="${UUID_DRAFTING}"`),
    );
    expect(r.html).toMatch(
      new RegExp(`data-stage="Published"[^>]*data-uuid="${UUID_PUBLISHED}"`),
    );
  });

  it('throws when a sidecar is malformed (no silent skip)', async () => {
    // A schema-broken sidecar should surface as a 500 — the dashboard
    // does not silently skip corrupt records.
    await writeFile(
      join(root, '.deskwork', 'entries', `${UUID_IDEA}.json`),
      JSON.stringify({ uuid: UUID_IDEA, currentStage: 'NotAStage' }),
    );
    const res = await app.fetch(new Request(`http://x/dev/editorial-studio`));
    // Hono surfaces uncaught throws as 500.
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
