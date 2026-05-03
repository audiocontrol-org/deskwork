/**
 * Entry-review CSS wiring smoke test.
 *
 * Phase 34a Layer 2 relocated the press-check chrome onto the
 * entry-keyed surface (`/dev/editorial-review/entry/<uuid>`). The
 * surface now ships the longform `er-*` class family from
 * `editorial-review.css` AND keeps the existing `er-entry-*` class
 * family from `entry-review.css` for the read-only / 404 variants.
 *
 * Both stylesheets are linked; both class families coexist without
 * collision.
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

async function seedArtifact(projectRoot: string, slug: string): Promise<void> {
  const dir = join(projectRoot, 'docs', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.md'), '# Hello World\n\nBody.\n', 'utf8');
}

describe('entry-review CSS wiring', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-review-styling-'));
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

  it('links both editorial-review.css and entry-review.css for the press-check surface', async () => {
    const entry = makeEntry('Drafting');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // Phase 34a: chrome IS the existing chrome being relocated; both
    // stylesheets ship — editorial-review for the press-check chrome,
    // entry-review for the read-only / 404 affordances.
    expect(html).toContain('href="/static/css/editorial-review.css"');
    expect(html).toContain('href="/static/css/entry-review.css"');
    // The longform layout cascades via the inner wrapper's data attr.
    expect(html).toContain('data-review-ui="longform"');
  });

  it('renders the press-check `er-*` class family for a Drafting entry', async () => {
    const entry = makeEntry('Drafting');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // Press-check chrome: the longform shell + page-grid + draft body.
    expect(html).toContain('class="er-review-shell"');
    expect(html).toContain('class="er-page-grid"');
    expect(html).toContain('class="er-draft-frame"');
    expect(html).toContain('class="er-page er-page"'.replace(' er-page', '')); // sanity: er-page is present (no double-class)
    expect(html).toMatch(/class="er-page"/);
    expect(html).toContain('class="er-strip"');
    // Marginalia + outline + scrapbook drawer chrome.
    expect(html).toContain('class="er-marginalia"');
    expect(html).toContain('class="er-marginalia-tab"');
    expect(html).toContain('class="er-outline-drawer"');
    expect(html).toContain('class="er-scrapbook-drawer"');
  });

  it('sets data-review-ui="entry-review" on body', async () => {
    const entry = makeEntry('Drafting');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<body[^>]*data-review-ui="entry-review"/);
  });

  it('includes entry-review.css in the 404 not-found variant', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(
        `http://x/dev/editorial-review/entry/99999999-9999-4999-8999-999999999999`,
      ),
    );
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('href="/static/css/editorial-review.css"');
    expect(html).toContain('href="/static/css/entry-review.css"');
  });

  it('renders the 404 shell with the er-entry-shell--missing class', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(
        `http://x/dev/editorial-review/entry/99999999-9999-4999-8999-999999999999`,
      ),
    );
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('class="er-entry-shell er-entry-shell--missing"');
    expect(html).toContain('Entry not found');
  });
});
