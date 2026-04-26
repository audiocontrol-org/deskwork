/**
 * In-process integration tests for the studio HTTP API. Builds the Hono
 * app against a tmp project (no real port binding), then drives it via
 * `app.fetch(request)` calls. Verifies each endpoint returns the same
 * shape that lib/review/handlers produces — the routing layer is just
 * plumbing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createWorkflow } from '@deskwork/core/review/pipeline';
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

async function getJson(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, body: await res.json() };
}

async function getText(
  app: ReturnType<typeof createApp>,
  path: string,
): Promise<{ status: number; text: string }> {
  const res = await app.fetch(new Request(`http://x${path}`));
  return { status: res.status, text: await res.text() };
}

describe('studio API', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-studio-test-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('POST /annotate', () => {
    it('mints a comment annotation and returns it', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'p',
        contentKind: 'longform',
        initialMarkdown: '# v1',
      });
      const r = await postJson(app, '/api/dev/editorial-review/annotate', {
        type: 'comment',
        workflowId: w.id,
        version: 1,
        range: { start: 0, end: 3 },
        text: 'tighten',
      });
      expect(r.status).toBe(200);
      const body = r.body as { annotation: { id: string } };
      expect(body.annotation.id).toMatch(/./);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await app.fetch(
        new Request('http://x/api/dev/editorial-review/annotate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{ broken',
        }),
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown workflow', async () => {
      const r = await postJson(app, '/api/dev/editorial-review/annotate', {
        type: 'approve',
        workflowId: 'no-such',
        version: 1,
      });
      expect(r.status).toBe(404);
    });
  });

  describe('GET /annotations', () => {
    it('lists annotations filtered by workflowId', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'p',
        contentKind: 'longform',
        initialMarkdown: '#',
      });
      await postJson(app, '/api/dev/editorial-review/annotate', {
        type: 'comment',
        workflowId: w.id,
        version: 1,
        range: { start: 0, end: 1 },
        text: 'a',
      });
      const r = await getJson(
        app,
        `/api/dev/editorial-review/annotations?workflowId=${w.id}`,
      );
      expect(r.status).toBe(200);
      expect((r.body as { annotations: unknown[] }).annotations).toHaveLength(1);
    });
  });

  describe('POST /decision', () => {
    it('advances workflow state', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'p',
        contentKind: 'longform',
        initialMarkdown: '#',
      });
      const r = await postJson(app, '/api/dev/editorial-review/decision', {
        workflowId: w.id,
        to: 'in-review',
      });
      expect(r.status).toBe(200);
      expect((r.body as { workflow: { state: string } }).workflow.state).toBe(
        'in-review',
      );
    });
  });

  describe('GET /workflow', () => {
    it('looks up by (site, slug)', async () => {
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug: 'lookup-me',
        contentKind: 'longform',
        initialMarkdown: '#',
      });
      const r = await getJson(
        app,
        `/api/dev/editorial-review/workflow?site=a&slug=lookup-me`,
      );
      expect(r.status).toBe(200);
      expect((r.body as { workflow: { id: string } }).workflow.id).toBe(w.id);
    });
  });

  describe('POST /version', () => {
    it('writes disk + appends a version + records edit annotation', async () => {
      const slug = 'savable';
      const blogFile = join(root, 'src/sites/a/content/blog', `${slug}.md`);
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, '# v1\n', 'utf-8');
      const w = createWorkflow(root, cfg, {
        site: 'a',
        slug,
        contentKind: 'longform',
        initialMarkdown: '# v1\n',
      });
      const r = await postJson(app, '/api/dev/editorial-review/version', {
        workflowId: w.id,
        beforeVersion: 1,
        afterMarkdown: '# v1\n\nnew content\n',
      });
      expect(r.status).toBe(200);
      expect(readFileSync(blogFile, 'utf-8')).toContain('new content');
    });
  });

  describe('POST /start-longform', () => {
    it('enqueues a longform workflow from a blog file', async () => {
      const slug = 'startable';
      const blogFile = join(root, 'src/sites/a/content/blog', `${slug}.md`);
      mkdirSync(dirname(blogFile), { recursive: true });
      writeFileSync(blogFile, '# Body', 'utf-8');
      const r = await postJson(app, '/api/dev/editorial-review/start-longform', {
        site: 'a',
        slug,
      });
      expect(r.status).toBe(200);
      expect((r.body as { workflow: { slug: string } }).workflow.slug).toBe(
        slug,
      );
    });

    it('returns 404 when the blog file does not exist', async () => {
      const r = await postJson(app, '/api/dev/editorial-review/start-longform', {
        site: 'a',
        slug: 'missing',
      });
      expect(r.status).toBe(404);
    });
  });
});

describe('studio pages', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-studio-pages-'));
    cfg = makeConfig();
    app = createApp({ projectRoot: root, config: cfg });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('GET /dev/editorial-studio renders the dashboard', async () => {
    const r = await getText(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.text).toContain('<title>Editorial Studio');
    expect(r.text).toContain('Editorial <em>Studio</em>');
    expect(r.text).toContain('/static/css/editorial-review.css');
    expect(r.text).toContain('/static/css/editorial-studio.css');
    expect(r.text).toContain('/static/dist/editorial-studio-client.js');
  });

  it('GET /dev/editorial-studio surfaces approved workflows in awaiting-press', async () => {
    // Approved workflows show up in the "Awaiting press" section even
    // without a calendar entry — the dashboard reads them from the
    // pipeline journal directly.
    const w = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'awaiting',
      contentKind: 'longform',
      initialMarkdown: '# v1',
    });
    // open → in-review → approved
    const path = '/api/dev/editorial-review/decision';
    await postJson(app, path, { workflowId: w.id, to: 'in-review' });
    await postJson(app, path, { workflowId: w.id, to: 'approved' });

    const r = await getText(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Awaiting press');
    expect(r.text).toContain('awaiting');
  });

  it('GET /dev/editorial-studio indents hierarchical entries by slug depth', async () => {
    // Seed a calendar with a parent + nested child + deeper grandchild.
    // The dashboard's display sort should cluster them and the rows
    // should carry data-depth + the --er-row-depth CSS variable.
    const calPath = join(root, 'docs/cal-a.md');
    mkdirSync(dirname(calPath), { recursive: true });
    const calMd = `# Editorial Calendar

## Ideas

| UUID | Slug | Title | Description | Keywords | Source |
|------|------|-------|-------------|----------|--------|
| 11111111-1111-4111-8111-111111111111 | the-outbound | Project | Hub | | manual |
| 22222222-2222-4222-8222-222222222222 | the-outbound/characters | Characters | Group | | manual |
| 33333333-3333-4333-8333-333333333333 | the-outbound/characters/strivers | Strivers | Subgroup | | manual |

## Planned

*No entries.*

## Outlining

*No entries.*

## Drafting

*No entries.*

## Review

*No entries.*

## Published

*No entries.*
`;
    writeFileSync(calPath, calMd, 'utf-8');

    const r = await getText(app, '/dev/editorial-studio');
    expect(r.status).toBe(200);

    // Top-level entry: no data-depth attribute on its wrap.
    expect(r.text).toMatch(
      /<div class="er-calendar-row-wrap" [^>]*data-search="[^"]*the-outbound[^/][^"]*"(?![^>]*data-depth)/,
    );
    // depth-1 entry has data-depth="1" + the CSS var
    expect(r.text).toContain('data-depth="1"');
    expect(r.text).toContain('--er-row-depth: 1');
    // depth-2 entry
    expect(r.text).toContain('data-depth="2"');
    expect(r.text).toContain('--er-row-depth: 2');
    // Leaf segment styling — only the leaf is bold, ancestors muted
    expect(r.text).toContain('er-row-slug-leaf');
    expect(r.text).toContain('er-row-slug-ancestors');

    // Entries are clustered: the-outbound row appears before
    // the-outbound/characters which appears before
    // the-outbound/characters/strivers.
    const idxParent = r.text.indexOf('data-slug="the-outbound"');
    const idxChild = r.text.indexOf('data-slug="the-outbound/characters"');
    const idxGrand = r.text.indexOf(
      'data-slug="the-outbound/characters/strivers"',
    );
    expect(idxParent).toBeGreaterThan(0);
    expect(idxChild).toBeGreaterThan(idxParent);
    expect(idxGrand).toBeGreaterThan(idxChild);
  });

  it('GET /dev/editorial-review-shortform renders', async () => {
    const r = await getText(app, '/dev/editorial-review-shortform');
    expect(r.status).toBe(200);
    expect(r.text).toContain('compositor');
    expect(r.text).toContain('No short-form galleys on the desk.');
    expect(r.text).toContain('/static/css/editorial-review.css');
  });

  it('GET /dev/editorial-help renders the manual', async () => {
    const r = await getText(app, '/dev/editorial-help');
    expect(r.status).toBe(200);
    expect(r.text).toContain("Compositor's");
    expect(r.text).toContain('End of manual');
    // Sections present
    expect(r.text).toContain('id="sec-model"');
    expect(r.text).toContain('id="sec-tracks"');
    expect(r.text).toContain('id="sec-catalogue"');
    expect(r.text).toContain('/static/css/editorial-help.css');
  });

  it('GET /dev/scrapbook/:site/:slug renders empty state', async () => {
    const r = await getText(app, '/dev/scrapbook/a/some-post');
    expect(r.status).toBe(200);
    expect(r.text).toContain('Scrapbook');
    expect(r.text).toContain('This scrapbook is empty');
    expect(r.text).toContain('/static/css/scrapbook.css');
    expect(r.text).toContain('/static/dist/scrapbook-client.js');
  });

  it('GET /dev/scrapbook/:site/:slug lists items when present', async () => {
    const dir = join(root, 'src/sites/a/content/blog/note-able/scrapbook');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'README.md'), '# Notes\n', 'utf-8');
    writeFileSync(join(dir, 'reference.md'), '# Refs\n', 'utf-8');
    const r = await getText(app, '/dev/scrapbook/a/note-able');
    expect(r.status).toBe(200);
    expect(r.text).toContain('README.md');
    expect(r.text).toContain('reference.md');
  });

  it('GET /dev/scrapbook/:site/:slug rejects unknown site', async () => {
    // Site param must be one of the configured sites — otherwise the path
    // resolver would receive an undefined SiteConfig (path traversal vector
    // and confusing errors for the operator).
    const r = await getText(app, '/dev/scrapbook/unknown-site/some-slug');
    expect(r.status).toBe(500);
  });

  it('GET /dev/scrapbook/:site/<deep-path> renders a hierarchical scrapbook', async () => {
    const dir = join(
      root,
      'src/sites/a/content/blog/the-outbound/characters/strivers/scrapbook',
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'archetypes.md'), '# notes', 'utf-8');
    const r = await getText(
      app,
      '/dev/scrapbook/a/the-outbound/characters/strivers',
    );
    expect(r.status).toBe(200);
    expect(r.text).toContain('archetypes.md');
    // Breadcrumb shows each path segment as a link, with the leaf
    // rendered as the current span.
    expect(r.text).toContain('scrapbook-breadcrumb');
    expect(r.text).toContain('href="/dev/scrapbook/a/the-outbound"');
    expect(r.text).toContain('href="/dev/scrapbook/a/the-outbound/characters"');
    expect(r.text).toContain('scrapbook-breadcrumb-current');
  });

  it('GET /dev/scrapbook/:site/<path> exposes secret items in a separate section', async () => {
    const sb = join(
      root,
      'src/sites/a/content/blog/the-outbound/scrapbook',
    );
    const secret = join(sb, 'secret');
    mkdirSync(secret, { recursive: true });
    writeFileSync(join(sb, 'public-note.md'), '#', 'utf-8');
    writeFileSync(join(secret, 'draft-thoughts.md'), '#', 'utf-8');
    const r = await getText(app, '/dev/scrapbook/a/the-outbound');
    expect(r.status).toBe(200);
    expect(r.text).toContain('public-note.md');
    expect(r.text).toContain('scrapbook-secret');
    expect(r.text).toContain('draft-thoughts.md');
    // Public-section item should NOT carry data-secret; secret-section
    // item should.
    expect(r.text).toMatch(
      /data-filename="draft-thoughts.md"[^>]*data-secret="true"/,
    );
  });

  it('GET /dev/scrapbook/:site/<path> hides secret section when no secret items', async () => {
    const sb = join(root, 'src/sites/a/content/blog/clean/scrapbook');
    mkdirSync(sb, { recursive: true });
    writeFileSync(join(sb, 'note.md'), '#', 'utf-8');
    const r = await getText(app, '/dev/scrapbook/a/clean');
    expect(r.status).toBe(200);
    expect(r.text).not.toContain('scrapbook-secret');
  });

  it('GET /dev/editorial-review/:slug returns an error page for unknown slug', async () => {
    const r = await getText(app, '/dev/editorial-review/nonexistent?site=a');
    expect(r.status).toBe(200);
    expect(r.text).toContain('No galley to review');
    expect(r.text).toContain('/static/css/editorial-review.css');
  });

  it('GET /dev/editorial-review/:slug renders a real workflow', async () => {
    const w = createWorkflow(root, cfg, {
      site: 'a',
      slug: 'rendered',
      contentKind: 'longform',
      initialMarkdown: '---\ntitle: Hello World\ndescription: A dispatch.\n---\n\n# Hello World\n\nBody prose.\n',
    });
    const r = await getText(app, `/dev/editorial-review/${w.slug}?site=a`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('Margin notes');
    expect(r.text).toContain('Hello World');
    expect(r.text).toContain('id="draft-state"');
    expect(r.text).toContain('/static/dist/editorial-review-client.js');
  });

  it('GET / redirects to the dashboard', async () => {
    const res = await app.fetch(new Request('http://x/'), {});
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dev/editorial-studio');
  });
});

describe('POST /api/dev/editorial-review/render', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-studio-render-'));
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders markdown to HTML', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/render', {
      markdown: '# Hello\n\nBody.\n',
    });
    expect(r.status).toBe(200);
    const body = r.body as { html: string };
    expect(typeof body.html).toBe('string');
    // The render pipeline strips the first H1 so the title doesn't repeat.
    expect(body.html).toContain('<p>Body.</p>');
    expect(body.html).not.toContain('<h1');
  });

  it('returns 400 when markdown is missing', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/render', {});
    expect(r.status).toBe(400);
  });

  it('returns 400 for non-string markdown', async () => {
    const r = await postJson(app, '/api/dev/editorial-review/render', {
      markdown: 42,
    });
    expect(r.status).toBe(400);
  });
});
