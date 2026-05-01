/**
 * Entry-review CSS wiring smoke test.
 *
 * Verifies that entry-review.css is linked and that rendered markup
 * carries the expected class/data attributes for CSS scoping.
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

  it('includes entry-review.css in cssHrefs', async () => {
    const entry = makeEntry('Drafting');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('href="/static/css/editorial-review.css"');
    expect(html).toContain('href="/static/css/entry-review.css"');
  });

  it('renders er-entry-* classes for mutable entry', async () => {
    const entry = makeEntry('Drafting');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="er-entry-shell"');
    expect(html).toContain('class="er-entry-head"');
    expect(html).toContain('class="er-entry-title"');
    expect(html).toContain('class="er-entry-meta"');
    expect(html).toContain('class="er-entry-stage"');
    expect(html).toContain('class="er-entry-controls');
    expect(html).toContain('class="er-entry-body"');
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

  it('includes entry-review.css in 404 not-found variant', async () => {
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

  it('renders 404 shell with er-entry-shell--missing class', async () => {
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
