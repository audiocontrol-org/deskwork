/**
 * Phase 21c — Studio integration for the shortform workflow.
 *
 * Covers:
 *   - POST /api/dev/editorial-review/start-shortform: success, missing
 *     fields, unknown platform.
 *   - GET /dev/editorial-review/<workflow-id>: a shortform workflow
 *     renders inside the unified review surface with a platform/channel
 *     header.
 *   - GET /dev/editorial-review-shortform: lists open shortform
 *     workflows as links into the unified review surface; empty state
 *     points the operator at the dashboard's matrix.
 *   - GET /dev/editorial-studio: matrix renders covered cells as
 *     anchors and empty cells as start buttons (data-action="start-shortform").
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
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

function seedCalendar(root: string, rows: string[]): void {
  const calPath = join(root, 'docs/cal-a.md');
  mkdirSync(join(root, 'docs'), { recursive: true });
  const calendar = [
    '# Editorial Calendar',
    '',
    '## Ideas',
    '',
    '*No entries.*',
    '',
    '## Planned',
    '',
    '*No entries.*',
    '',
    '## Outlining',
    '',
    '*No entries.*',
    '',
    '## Drafting',
    '',
    '*No entries.*',
    '',
    '## Review',
    '',
    '*No entries.*',
    '',
    '## Published',
    '',
    '| UUID | Slug | Title | Description | Keywords | Source | DatePublished |',
    '|------|------|-------|-------------|----------|--------|---------------|',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(calPath, calendar, 'utf-8');
}

async function postJson(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(
    new Request(`http://x${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

async function getText(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; text: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, text: await res.text() };
}

describe('POST /api/dev/editorial-review/start-shortform', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sf-start-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
    // Seed a published blog entry so the calendar lookup succeeds.
    seedCalendar(root, [
      '| 11111111-1111-4111-8111-111111111111 | hello-world | Hello | A post |  | manual | 2026-01-01 |',
    ]);
    // Start-shortform's resolver looks up the entry directory anchored
    // off the body file. Materialize it so `resolveShortformWorkflowFilePath`
    // can land on the canonical entry-dir/scrapbook/shortform path.
    const blogFile = join(root, 'src/sites/a/content/blog/hello-world.md');
    mkdirSync(join(root, 'src/sites/a/content/blog'), { recursive: true });
    writeFileSync(blogFile, '# Hello World\n\nBody.\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates a workflow + scaffolds the file + returns reviewUrl', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/start-shortform', {
      site: 'a',
      slug: 'hello-world',
      platform: 'linkedin',
    });
    expect(r.status).toBe(200);
    const body = r.body as {
      workflow: { id: string; contentKind: string; platform: string };
      reviewUrl: string;
      filePath: string;
    };
    expect(body.workflow.contentKind).toBe('shortform');
    expect(body.workflow.platform).toBe('linkedin');
    expect(body.workflow.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.reviewUrl).toBe(`/dev/editorial-review/${body.workflow.id}`);
    expect(existsSync(body.filePath)).toBe(true);
    const written = readFileSync(body.filePath, 'utf-8');
    expect(written).toContain('platform: linkedin');
  });

  it('honors a channel when provided', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/start-shortform', {
      site: 'a',
      slug: 'hello-world',
      platform: 'reddit',
      channel: 'rprogramming',
    });
    expect(r.status).toBe(200);
    const body = r.body as {
      workflow: { channel: string; platform: string };
      filePath: string;
    };
    expect(body.workflow.platform).toBe('reddit');
    expect(body.workflow.channel).toBe('rprogramming');
    const written = readFileSync(body.filePath, 'utf-8');
    expect(written).toContain('channel: rprogramming');
  });

  it('returns 400 when platform is missing', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/start-shortform', {
      site: 'a',
      slug: 'hello-world',
    });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/platform is required/);
  });

  it('returns 400 for an invalid platform', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/start-shortform', {
      site: 'a',
      slug: 'hello-world',
      platform: 'mastodon',
    });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/invalid platform/);
  });

  it('returns 400 when site is missing', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/start-shortform', {
      slug: 'hello-world',
      platform: 'linkedin',
    });
    expect(r.status).toBe(400);
  });

  it('is idempotent on (site, slug, platform, channel)', async () => {
    const first = await postJson(app, '/api/dev/editorial-review/start-shortform', {
      site: 'a',
      slug: 'hello-world',
      platform: 'youtube',
    });
    const second = await postJson(app, '/api/dev/editorial-review/start-shortform', {
      site: 'a',
      slug: 'hello-world',
      platform: 'youtube',
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = first.body as { workflow: { id: string } };
    const b = second.body as { workflow: { id: string }; existing: boolean };
    expect(b.workflow.id).toBe(a.workflow.id);
    expect(b.existing).toBe(true);
  });
});

describe('GET /dev/editorial-review/<workflow-id> for shortform', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sf-render-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
    seedCalendar(root, [
      '| 22222222-2222-4222-8222-222222222222 | the-pitch | The Pitch | A post |  | manual | 2026-01-01 |',
    ]);
    mkdirSync(join(root, 'src/sites/a/content/blog'), { recursive: true });
    writeFileSync(
      join(root, 'src/sites/a/content/blog/the-pitch.md'),
      '# The Pitch\n\nBody.\n',
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders the shortform workflow inside the unified review surface', async () => {
    const start = await postJson(
      app,
      '/api/dev/editorial-review/start-shortform',
      {
        site: 'a',
        slug: 'the-pitch',
        platform: 'linkedin',
        initialMarkdown: 'Pitch deck copy.\n',
      },
    );
    expect(start.status).toBe(200);
    const startBody = start.body as { workflow: { id: string }; reviewUrl: string };
    const r = await getText(app, startBody.reviewUrl);
    expect(r.status).toBe(200);
    // Unified review surface — same client bundle the longform uses.
    expect(r.text).toContain('/static/dist/editorial-review-client.js');
    expect(r.text).toContain('id="draft-state"');
    // Shortform-specific page chrome.
    expect(r.text).toContain('data-review-ui="shortform"');
    // Platform header element renders the workflow's platform.
    expect(r.text).toContain('class="er-shortform-meta"');
    expect(r.text).toContain('class="er-platform">linkedin');
    // The unified review surface buttons (longform contract) are
    // present — same data-action selectors, no shortform-specific
    // duplicates.
    expect(r.text).toMatch(/data-action="save-version"/);
    expect(r.text).toMatch(/data-action="approve"/);
    expect(r.text).toMatch(/data-action="iterate"/);
    expect(r.text).toMatch(/data-action="reject"/);
  });

  it('renders the channel chip when the workflow has one', async () => {
    const start = await postJson(
      app,
      '/api/dev/editorial-review/start-shortform',
      {
        site: 'a',
        slug: 'the-pitch',
        platform: 'reddit',
        channel: 'rprogramming',
      },
    );
    const startBody = start.body as { workflow: { id: string } };
    const r = await getText(app, `/dev/editorial-review/${startBody.workflow.id}`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('class="er-platform">reddit');
    expect(r.text).toContain('class="er-channel">rprogramming');
  });
});

describe('GET /dev/editorial-review-shortform — index page', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sf-index-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
    seedCalendar(root, [
      '| 33333333-3333-4333-8333-333333333333 | first-post | First | A post |  | manual | 2026-01-01 |',
    ]);
    mkdirSync(join(root, 'src/sites/a/content/blog'), { recursive: true });
    writeFileSync(
      join(root, 'src/sites/a/content/blog/first-post.md'),
      '# First\n\nBody.\n',
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('shows an empty state pointing at the dashboard Drafting list (#106)', async () => {
    const r = await getText(app, '/dev/editorial-review-shortform');
    expect(r.status).toBe(200);
    expect(r.text).toContain('No short-form galleys on the desk.');
    expect(r.text).toMatch(
      /Start a new shortform draft from the dashboard's[\s\S]*Drafting list/,
    );
    expect(r.text).toContain('href="/dev/editorial-studio#stage-drafting"');
    // No textarea or compose-style action buttons in the empty state.
    expect(r.text).not.toContain('<textarea');
    expect(r.text).not.toContain('data-action="save"');
  });

  it('lists open shortform workflows as links to the unified review surface', async () => {
    const start = await postJson(
      app,
      '/api/dev/editorial-review/start-shortform',
      { site: 'a', slug: 'first-post', platform: 'linkedin' },
    );
    const startBody = start.body as { workflow: { id: string } };
    const r = await getText(app, '/dev/editorial-review-shortform');
    expect(r.status).toBe(200);
    // The row links into the unified review surface.
    expect(r.text).toContain(`href="/dev/editorial-review/${startBody.workflow.id}"`);
    // Old composer DOM is gone.
    expect(r.text).not.toContain('<textarea');
    // The desk index does not bundle the legacy save/approve/iterate
    // buttons — those live on the unified review surface only.
    expect(r.text).not.toMatch(/data-action="save"[^-]/);
    // The index page should NOT carry the longform editor's data-actions
    // because the editor lives on the per-workflow review surface.
    expect(r.text).not.toContain('data-action="save-version"');
  });
});

describe('GET /dev/editorial-studio — coverage matrix', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-sf-matrix-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
    seedCalendar(root, [
      '| 44444444-4444-4444-8444-444444444444 | matrix-post | Matrix | A post |  | manual | 2026-01-01 |',
    ]);
    mkdirSync(join(root, 'src/sites/a/content/blog'), { recursive: true });
    writeFileSync(
      join(root, 'src/sites/a/content/blog/matrix-post.md'),
      '# Matrix\n\nBody.\n',
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('empty cells render a start button (data-action="start-shortform")', async () => {
    const r = await getText(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // Every empty cell becomes an inline start button. Phase 21c
    // replaced the prior copy-CLI-command flow with a real POST.
    expect(r.text).toContain('data-action="start-shortform"');
    expect(r.text).toMatch(/data-platform="linkedin"/);
    expect(r.text).toMatch(/data-platform="reddit"/);
    expect(r.text).toMatch(/data-platform="youtube"/);
    expect(r.text).toMatch(/data-platform="instagram"/);
    // No copy-CLI-command escape hatch hanging around in the matrix.
    expect(r.text).not.toContain('/editorial-shortform-draft');
  });

  it('covered cells with a live workflow render an anchor to the review URL', async () => {
    const start = await postJson(
      app,
      '/api/dev/editorial-review/start-shortform',
      { site: 'a', slug: 'matrix-post', platform: 'linkedin' },
    );
    const startBody = start.body as { workflow: { id: string } };
    const r = await getText(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    // The covered cell links to the unified review surface for that
    // workflow id.
    expect(r.text).toContain(
      `href="/dev/editorial-review/${startBody.workflow.id}"`,
    );
    // The check sigil sits inside the anchor element (er-sf-link).
    expect(r.text).toMatch(/er-sf-link[^>]*>✓/);
  });
});
