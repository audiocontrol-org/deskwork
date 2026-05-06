/**
 * Entry-uuid keyed review-route smoke (pipeline-redesign Task 35;
 * Phase 34a Layer 2 expanded the surface to render the press-check
 * chrome).
 *
 * Boots the studio app against a tmp project tree carrying a sidecar +
 * a markdown artifact, then drives the entry-review route via app.fetch
 * and asserts on response status + rendered chrome shape. The
 * affordance helper itself is tested separately in
 * stage-affordances.test.ts; this file covers the route + page render
 * boundary.
 *
 * Phase 34a Layer 2 changed the markup: the surface is no longer a
 * minimal stage controller (`er-entry-shell` with `data-control="save|
 * iterate|approve|reject"` buttons). It now renders the full press-
 * check chrome (`er-review-shell` with `data-action="..."` buttons +
 * version strip + edit toolbar + marginalia + scrapbook drawer +
 * decision strip). The Reject button is rendered `disabled` with a
 * tooltip pointing at issue #173 (entry-keyed reject semantics
 * undefined). The Save button is rendered ENABLED — it's a dumb
 * file-write affordance (#174) that POSTs to the entry-keyed body
 * endpoint.
 *
 * Read-only stages (Published / Blocked / Cancelled) still use the
 * `er-entry-control--*` class family from the original entry-review
 * surface — those affordances coexist with the relocated chrome.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const KNOWN_UUID = '11111111-1111-4111-8111-111111111111';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'docs',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
}

function makeEntry(stage: Entry['currentStage'], overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: KNOWN_UUID,
    slug: 'hello-world',
    title: 'Hello World',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: { Drafting: 1 },
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

async function seedArtifact(
  projectRoot: string,
  slug: string,
  stage: 'index' | 'idea' | 'plan' | 'outline',
  body: string,
): Promise<void> {
  const dir =
    stage === 'index'
      ? join(projectRoot, 'docs', slug)
      : join(projectRoot, 'docs', slug, 'scrapbook');
  await mkdir(dir, { recursive: true });
  const filename = stage === 'index' ? 'index.md' : `${stage}.md`;
  await writeFile(join(dir, filename), body, 'utf8');
}

describe('GET /dev/editorial-review/entry/:entryId', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-review-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify(cfg),
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders the press-check chrome for a Drafting entry', async () => {
    const entry = makeEntry('Drafting');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world', 'index', '# Hello World\n\nProse.\n');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // Title + entry uuid attribute on the page-grid wrapper.
    expect(html).toContain('Hello World');
    expect(html).toContain(`data-entry-uuid="${KNOWN_UUID}"`);
    // Press-check chrome: the longform shell + page-grid + draft body.
    expect(html).toContain('class="er-review-shell"');
    expect(html).toContain('data-review-ui="longform"');
    expect(html).toContain('id="draft-body"');
    expect(html).toContain('class="er-page-grid"');
    // Decision strip: Approve / Iterate / Reject (Reject disabled).
    expect(html).toContain('data-action="approve"');
    expect(html).toContain('data-action="iterate"');
    expect(html).toContain('data-action="reject"');
    expect(html).toMatch(/data-action="reject"[^>]*disabled/);
    expect(html).toContain('issues/173');
    // Edit toolbar: Save button is rendered ENABLED (#174 — dumb file
    // write, no state-management gate). The pending-design tooltip is
    // gone; the markup must NOT carry a `disabled` attribute on the
    // save button.
    expect(html).toContain('data-action="save-version"');
    expect(html).not.toMatch(/data-action="save-version"[^>]*disabled/);
    expect(html).not.toContain('Save semantics for the entry-keyed surface are pending design');
    expect(html).not.toContain('issues/174');
    // Marginalia + scrapbook drawer + outline tab + shortcuts overlay.
    expect(html).toContain('data-comments-sidebar');
    expect(html).toContain('data-scrapbook-drawer');
    expect(html).toContain('data-shortcuts-overlay');
    // Embedded state JSON drives the client.
    expect(html).toContain('id="entry-review-state"');
    expect(html).toContain(`"entryId":"${KNOWN_UUID}"`);
  });

  it('renders 200 + read-only affordances for a Published entry', async () => {
    const entry = makeEntry('Published');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world', 'index', '# Hello World\n');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // Read-only chrome: the decision strip emits the read-only +
    // fork-placeholder pair from getAffordances('Published').
    expect(html).toContain('Read-only');
    expect(html).toContain('Fork (coming)');
    expect(html).toContain('data-control="fork"');
    // The Approve / Iterate / Reject mutation buttons are absent.
    expect(html).not.toContain('data-action="approve"');
    expect(html).not.toContain('data-action="iterate"');
  });

  it('renders 200 + induct stage picker for a Blocked entry', async () => {
    const entry = makeEntry('Blocked', { priorStage: 'Drafting' });
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world', 'index', '# Hello World\n');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // Blocked surfaces the induct-to picker (no mutation buttons).
    expect(html).toContain('name="induct-to"');
    for (const stage of ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final']) {
      expect(html).toContain(`<option value="${stage}">`);
    }
    expect(html).not.toContain('data-action="approve"');
    expect(html).not.toContain('data-action="iterate"');
  });

  it('returns 404 when the entry uuid is not found', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(
        `http://x/dev/editorial-review/entry/99999999-9999-4999-8999-999999999999`,
      ),
    );
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Entry not found');
  });

  it('does not collide with the legacy uuid review route', async () => {
    // The legacy `/dev/editorial-review/<uuid>` route still exists and
    // resolves through the calendar/workflow path. The new entry route
    // sits at `/dev/editorial-review/entry/<uuid>` — verify Hono routes
    // them independently by hitting the legacy URL with NO calendar
    // entry, which should fall through to the workflow/legacy renderer
    // (returning a 200 explainer page, not the entry-review 404 shell).
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/${KNOWN_UUID}`),
    );
    // Legacy route never returns the entry-review 404 page; it returns
    // 200 with the "no galley" explainer. We only assert the route
    // didn't get hijacked.
    const html = await res.text();
    expect(html).not.toContain('No sidecar matched');
  });
});
