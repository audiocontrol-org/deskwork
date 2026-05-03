/**
 * Bare-UUID review routing — Phase 34a (#171).
 *
 * The legacy slug catch-all (`/dev/editorial-review/<slug>`) and the
 * legacy longform/outline render path (`pages/review.ts`) were retired.
 * The bare-UUID route now serves two purposes:
 *
 *   1. UUID matches a SHORTFORM workflow record → render the slim
 *      shortform surface (`pages/shortform-review.ts`). Operator-confirmed
 *      deferral; the workflow-keyed shortform pipeline survives until
 *      its own migration phase.
 *   2. UUID does NOT match a shortform workflow (longform entry uuid OR
 *      unknown uuid) → 301-redirect to `/dev/editorial-review/entry/<uuid>`.
 *      The redirect is a backwards-compat shim for in-flight bookmarks +
 *      any link emitter not yet updated.
 *
 * The slug catch-all is gone entirely; slug URLs return 404.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import { createWorkflow } from '@deskwork/core/review/pipeline';
import type {
  CalendarEntry,
  EditorialCalendar,
} from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

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

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    slug: 'placeholder',
    title: 'Placeholder',
    description: '',
    stage: 'Drafting',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

const KNOWN_UUID = '11111111-1111-4111-8111-111111111111';

function buildFixture(root: string, cfg: DeskworkConfig, entries: CalendarEntry[]) {
  const cal: EditorialCalendar = { entries, distributions: [] };
  const calendarPath = join(root, cfg.sites.a.calendarPath);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeCalendar(calendarPath, cal);
}

describe('bare-UUID review routing — Phase 34a (#171)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-review-routing-'));
    cfg = makeConfig();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders shortform surface when UUID matches a shortform workflow', async () => {
    buildFixture(root, cfg, [
      entry({
        id: KNOWN_UUID,
        slug: 'a-tweet',
        title: 'A Tweet',
        stage: 'Drafting',
      }),
    ]);
    app = createApp({ projectRoot: root, config: cfg });

    const wf = createWorkflow(root, cfg, {
      entryId: KNOWN_UUID,
      site: 'a',
      slug: 'a-tweet',
      contentKind: 'shortform',
      platform: 'linkedin',
      initialMarkdown: '---\ntitle: A Tweet\n---\n\n# A Tweet\n\nBody.\n',
    });

    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/${wf.id}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-review-ui="shortform"');
    expect(html).toContain('A Tweet');
    expect(html).toContain('id="draft-state"');
  });

  it('301-redirects to entry-keyed URL when UUID has no workflow', async () => {
    buildFixture(root, cfg, []);
    app = createApp({ projectRoot: root, config: cfg });

    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/${KNOWN_UUID}`),
      { redirect: 'manual' },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(
      `/dev/editorial-review/entry/${KNOWN_UUID}`,
    );
  });

  it('301-redirects when UUID matches a LONGFORM workflow (legacy data)', async () => {
    // Longform workflows are not rendered through the slim
    // shortform-review surface — they redirect to the entry-keyed URL,
    // matching the canonical longform path.
    buildFixture(root, cfg, [
      entry({
        id: KNOWN_UUID,
        slug: 'hello-world',
        title: 'Hello World',
        stage: 'Drafting',
      }),
    ]);
    app = createApp({ projectRoot: root, config: cfg });

    const wf = createWorkflow(root, cfg, {
      entryId: KNOWN_UUID,
      site: 'a',
      slug: 'hello-world',
      contentKind: 'longform',
      initialMarkdown: '---\ntitle: Hello World\n---\n\n# Hello World\n',
    });

    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/${wf.id}`),
      { redirect: 'manual' },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(
      `/dev/editorial-review/entry/${wf.id}`,
    );
  });

  it('preserves query string on the 301 redirect', async () => {
    buildFixture(root, cfg, []);
    app = createApp({ projectRoot: root, config: cfg });

    const res = await app.fetch(
      new Request(
        `http://x/dev/editorial-review/${KNOWN_UUID}?v=2&site=a`,
      ),
      { redirect: 'manual' },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(
      `/dev/editorial-review/entry/${KNOWN_UUID}?v=2&site=a`,
    );
  });

  it('returns 404 for slug paths (legacy slug catch-all retired)', async () => {
    buildFixture(root, cfg, [
      entry({
        id: KNOWN_UUID,
        slug: 'hello-world',
        title: 'Hello World',
        stage: 'Drafting',
      }),
    ]);
    app = createApp({ projectRoot: root, config: cfg });

    const res = await app.fetch(
      new Request('http://x/dev/editorial-review/hello-world'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for hierarchical slug paths', async () => {
    buildFixture(root, cfg, []);
    app = createApp({ projectRoot: root, config: cfg });

    const res = await app.fetch(
      new Request(
        'http://x/dev/editorial-review/the-outbound/characters/strivers',
      ),
    );
    expect(res.status).toBe(404);
  });

  it('shortform-review serves a specific version via ?v=', async () => {
    buildFixture(root, cfg, [
      entry({
        id: KNOWN_UUID,
        slug: 'a-tweet',
        title: 'A Tweet',
        stage: 'Drafting',
      }),
    ]);
    app = createApp({ projectRoot: root, config: cfg });

    const wf = createWorkflow(root, cfg, {
      entryId: KNOWN_UUID,
      site: 'a',
      slug: 'a-tweet',
      contentKind: 'shortform',
      platform: 'linkedin',
      initialMarkdown: '---\ntitle: v1\n---\n\n# Tweet v1\n',
    });

    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/${wf.id}?v=1`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-review-ui="shortform"');
  });
});
