/**
 * Entry-uuid keyed review-route smoke (pipeline-redesign Task 35).
 *
 * Boots the studio app against a tmp project tree carrying a sidecar +
 * a markdown artifact, then drives the entry-review route via app.fetch
 * and asserts on response status + rendered affordance shape. The
 * affordance helper itself is tested separately in
 * stage-affordances.test.ts; this file covers the route + page render
 * boundary.
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
        contentDir: 'src/sites/a/content/blog',
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
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders 200 + mutable controls for a Drafting entry', async () => {
    const entry = makeEntry('Drafting');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world', 'index', '# Hello World\n\nProse.\n');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Hello World');
    expect(html).toContain('data-entry-uuid="' + KNOWN_UUID + '"');
    expect(html).toContain('data-stage="Drafting"');
    // Mutable affordance: textarea + buttons
    expect(html).toContain('<textarea');
    expect(html).toContain('data-control="save"');
    expect(html).toContain('data-control="iterate"');
    expect(html).toContain('data-control="approve"');
    expect(html).toContain('data-control="reject"');
  });

  it('renders 200 + read-only artifact for a Published entry', async () => {
    const entry = makeEntry('Published');
    await writeSidecar(projectRoot, entry);
    await seedArtifact(projectRoot, 'hello-world', 'index', '# Hello World\n');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Read-only');
    expect(html).toContain('data-mutable="false"');
    expect(html).toContain('Fork (coming)');
    // No mutating buttons
    expect(html).not.toContain('data-control="save"');
    expect(html).not.toContain('data-control="iterate"');
  });

  it('renders 200 + induct stage picker for a Blocked entry', async () => {
    const entry = makeEntry('Blocked', { priorStage: 'Drafting' });
    await writeSidecar(projectRoot, entry);
    // Blocked uses priorStage to locate the artifact.
    await seedArtifact(projectRoot, 'hello-world', 'index', '# Hello World\n');

    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${KNOWN_UUID}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-stage="Blocked"');
    expect(html).toContain('paused from Drafting');
    expect(html).toContain('name="induct-to"');
    // The picker contains every linear pipeline stage.
    for (const stage of ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final']) {
      expect(html).toContain(`<option value="${stage}">`);
    }
    // No mutating controls.
    expect(html).not.toContain('data-control="save"');
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
